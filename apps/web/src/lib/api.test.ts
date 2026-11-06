import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  apiGet, apiLogin, apiPost, clearToken, getApiBaseUrl,
  loadStoredToken, storeToken,
} from "./api";

const originalApiUrl = process.env.NEXT_PUBLIC_API_URL;

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json" },
  });
}
function fakeStorage() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => { items.set(key, value); },
    removeItem: (key: string) => { items.delete(key); },
  };
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_API_URL = "https://api.example.test/";
});
afterEach(() => {
  if (originalApiUrl === undefined) delete process.env.NEXT_PUBLIC_API_URL;
  else process.env.NEXT_PUBLIC_API_URL = originalApiUrl;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("API F2: configuração", () => {
  it("remove barra final da base configurada", () => {
    expect(getApiBaseUrl()).toBe("https://api.example.test");
  });
  it("não envia credenciais ao localhost do visitante sem API configurada", () => {
    delete process.env.NEXT_PUBLIC_API_URL;
    expect(() => getApiBaseUrl()).toThrow("API autenticada não configurada");
  });

  it("rejeita configuração HTTP remota insegura", () => {
    process.env.NEXT_PUBLIC_API_URL = "http://api.exemplo.org";
    expect(() => getApiBaseUrl()).toThrow("URL insegura");
  });

  it("aceita URL HTTP somente na máquina de desenvolvimento", () => {
    process.env.NEXT_PUBLIC_API_URL = "http://127.0.0.1:3001/";
    expect(getApiBaseUrl()).toBe("http://127.0.0.1:3001");
  });

  it("não faz requisição de login sem API liberada", async () => {
    delete process.env.NEXT_PUBLIC_API_URL;
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
    await expect(apiLogin("teste@example.test", "senha")).rejects.toThrow("API autenticada não configurada");
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("API F2: login", () => {
  it("envia email/senha no corpo JSON, sem token de autorização", async () => {
    const mockFetch = vi.fn().mockResolvedValue(respond({
      accessToken: "fake-jwt", tokenType: "Bearer", expiresInSeconds: 3600,
      user: { userId: "u-1", personId: "p-1", email: "ana@example.test", grants: [] },
    }));
    vi.stubGlobal("fetch", mockFetch);
    const data = await apiLogin("ana@example.test", "fake-password");
    expect(data.accessToken).toBe("fake-jwt");
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch).toHaveBeenCalledWith("https://api.example.test/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "ana@example.test", password: "fake-password" }),
    });
  });

  it.each([400, 401, 403, 429, 500])("relata falha HTTP %i sem armazenar token", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Falha de autenticação", { status })));
    await expect(apiLogin("test@example.test", "wrong")).rejects.toThrow("Falha de autenticação");
  });
  it("relata status HTTP quando corpo de erro está vazio", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 503 })));
    await expect(apiLogin("test@example.test", "wrong")).rejects.toThrow("Login falhou (503)");
  });
  it("propaga falha de rede como exceção (sem autenticar)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("NetworkError")));
    await expect(apiLogin("test@example.test", "wrong")).rejects.toThrow("NetworkError");
  });
});

describe("API F2: consultas autenticadas", () => {
  it.each([
    ["/memberships", { memberships: [] }],
    ["/admissions", { admissions: [] }],
    ["/persons/search?q=ana", { hits: [] }],
    ["/credentials/me", { card: null }],
  ])("GET %s acrescenta JWT e interpreta JSON", async (path, body) => {
    const mockFetch = vi.fn().mockResolvedValue(respond(body));
    vi.stubGlobal("fetch", mockFetch);
    expect(await apiGet<unknown>(path, "fake-jwt")).toEqual(body);
    expect(mockFetch).toHaveBeenCalledWith("https://api.example.test" + path, {
      headers: { Authorization: "Bearer fake-jwt" },
    });
  });

  it.each([400, 401, 403, 409, 500])("preserva código e mensagem de erro do GET %i", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status })));
    await expect(apiGet("/admissions", "fake-jwt")).rejects.toThrow("GET /admissions falhou (" + status + ")");
  });
  it("propaga indisponibilidade de rede", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(apiGet("/memberships", "fake-jwt")).rejects.toThrow("offline");
  });
});

describe("API F2: operações", () => {
  it("POST /admissions envia JSON e Bearer", async () => {
    const mockFetch = vi.fn().mockResolvedValue(respond({ id: "a-001", status: "DRAFT" }, 201));
    vi.stubGlobal("fetch", mockFetch);
    expect(await apiPost<{ id: string }>("/admissions", "fake-jwt", {
      personId: "p-003", modality: "BATISMO",
    })).toMatchObject({ id: "a-001" });
    expect(mockFetch).toHaveBeenCalledWith("https://api.example.test/admissions", {
      method: "POST",
      headers: { Authorization: "Bearer fake-jwt", "Content-Type": "application/json" },
      body: JSON.stringify({ personId: "p-003", modality: "BATISMO" }),
    });
  });
  it("POST /admissions/:id/advance usa o contrato sem prefixo /api", async () => {
    const mockFetch = vi.fn().mockResolvedValue(respond({ status: "AWAITING_PASTOR" }));
    vi.stubGlobal("fetch", mockFetch);
    await apiPost("/admissions/a-001/advance", "fake-jwt", {
      completeStep: "secretaria", decision: "APPROVE",
    });
    expect(mockFetch.mock.calls[0][0]).toBe("https://api.example.test/admissions/a-001/advance");
  });
  it("permite POST sem corpo para emissão de carteirinha", async () => {
    const mockFetch = vi.fn().mockResolvedValue(respond({ status: "ACTIVE" }));
    vi.stubGlobal("fetch", mockFetch);
    await apiPost("/credentials/issue/m-1", "fake-jwt");
    expect(mockFetch.mock.calls[0][1].body).toBeUndefined();
  });
  it.each([400, 401, 403, 409, 500])("trata erro HTTP %i do POST", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status })));
    await expect(apiPost("/admissions", "fake-jwt", {})).rejects.toThrow("POST /admissions falhou (" + status + ")");
  });
  it("propaga erro do backend com código de negócio sem mascarar", async () => {
    const error = { statusCode: 409, code: "ADMISSION_STEP_LOCKED", message: "Etapa bloqueada" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(error, 409)));
    await expect(apiPost("/admissions/a-1/advance", "fake-jwt", {})).rejects.toThrow("ADMISSION_STEP_LOCKED");
  });
});

describe("API F2: sessão do navegador", () => {
  it("sem navegador não lê token armazenado", () => {
    expect(loadStoredToken()).toBeNull();
  });
  it("salva, lê e apaga token no sessionStorage, não no localStorage", () => {
    const sessionStorage = fakeStorage();
    vi.stubGlobal("window", { sessionStorage });
    expect(loadStoredToken()).toBeNull();
    storeToken("fake-jwt");
    expect(loadStoredToken()).toBe("fake-jwt");
    clearToken();
    expect(loadStoredToken()).toBeNull();
  });
});
