import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  apiGet, apiLogin, apiPost, apiPatch, ApiRequestError, clearApiTimings, clearToken, forgetValidatedSession,
  getApiBaseUrl, isInvalidSession, loadStoredToken, loginFailureMessage, percentile, readValidatedSession,
  rememberValidatedSession, SESSION_FRESH_MS, SESSION_UNAUTHORIZED_EVENT, storeToken,
  summarizeApiTimings,
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
function expectTransport(mockFetch: ReturnType<typeof vi.fn>, url: string, init: Record<string, unknown>) {
  expect(mockFetch).toHaveBeenCalledWith(url, expect.objectContaining(init));
  const options = mockFetch.mock.calls.at(-1)?.[1] as RequestInit;
  expect(options.credentials).toBe("omit");
  expect(options.cache).toBe("no-store");
  expect(options.signal).toBeInstanceOf(AbortSignal);
}

const sessionUser = {
  userId: "u-1", personId: "p-1", email: "ana@example.test", grants: [] as Array<{ roleCode: string }>,
};

afterEach(() => {
  if (originalApiUrl === undefined) delete process.env.NEXT_PUBLIC_API_URL;
  else process.env.NEXT_PUBLIC_API_URL = originalApiUrl;
  forgetValidatedSession();
  clearApiTimings();
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

  it("bloqueia URL para localhost quando o site não está em desenvolvimento", () => {
    process.env.NEXT_PUBLIC_API_URL = "http://127.0.0.1:3001/";
    expect(() => getApiBaseUrl()).toThrow("API local permitida somente em desenvolvimento");
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
    expectTransport(mockFetch, "https://api.example.test/auth/login", {
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
    expectTransport(mockFetch, "https://api.example.test" + path, {
      method: "GET",
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
    expectTransport(mockFetch, "https://api.example.test/admissions", {
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

describe("DAS — PATCH autenticado",()=>{
  it("envia token e corpo de atualização para API autorizada",async()=>{
    const mockFetch=vi.fn().mockResolvedValue(respond({id:"case-1",status:"DONE"}));
    vi.stubGlobal("fetch",mockFetch);
    const result=await apiPatch<{status:string}>("/pastoral-cases/case-1/status","fake-token",{status:"DONE"});
    expect(result.status).toBe("DONE");
    expectTransport(mockFetch, "https://api.example.test/pastoral-cases/case-1/status", {
      method: "PATCH",
      headers: { Authorization: "Bearer fake-token", "Content-Type": "application/json" },
      body: JSON.stringify({ status: "DONE" }),
    });
  });
  it("mantém erro 403 sem simular persistência",async()=>{
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response("",{status:403})));
    await expect(apiPatch("/discipleship/enrollments/test","fake-token",{status:"COMPLETED"}))
      .rejects.toThrow("PATCH /discipleship/enrollments/test falhou (403)");
  });
});

describe("API A1: sessão, timeout e medição", () => {
  it("não repete /auth/me enquanto a confirmação está fresca", async () => {
    rememberValidatedSession("fake-jwt", sessionUser);
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
    await expect(apiGet("/auth/me", "fake-jwt")).resolves.toMatchObject({ email: "ana@example.test" });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(summarizeApiTimings("/auth/me").fromCache).toBe(1);
  });

  it("consulta de novo quando o chamador pede sessão fresca", async () => {
    rememberValidatedSession("fake-jwt", sessionUser);
    const mockFetch = vi.fn().mockResolvedValue(respond({ ...sessionUser, email: "nova@example.test" }));
    vi.stubGlobal("fetch", mockFetch);
    await expect(apiGet("/auth/me", "fake-jwt", { fresh: true })).resolves.toMatchObject({ email: "nova@example.test" });
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("reaproveita /auth/me expirado se a rede só oscilou", async () => {
    rememberValidatedSession("fake-jwt", sessionUser, Date.now() - SESSION_FRESH_MS - 50);
    expect(readValidatedSession("fake-jwt")).toBeNull();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("NetworkError")));
    await expect(apiGet("/auth/me", "fake-jwt")).resolves.toMatchObject({ email: "ana@example.test" });
  });

  it("classifica tempo esgotado sem apagar a sessão", async () => {
    const sessionStorage = fakeStorage();
    sessionStorage.setItem("idbrf_demo_token", "fake-jwt");
    const events: string[] = [];
    vi.stubGlobal("window", {
      sessionStorage,
      dispatchEvent: (event: Event) => { events.push(event.type); return true; },
    });
    rememberValidatedSession("fake-jwt", sessionUser);
    vi.stubGlobal("fetch", (_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => {
        const abort = new Error("Aborted");
        abort.name = "AbortError";
        reject(abort);
      });
    }));
    await expect(apiGet("/memberships", "fake-jwt", { timeoutMs: 20 })).rejects.toMatchObject({ kind: "timeout", status: null });
    expect(sessionStorage.getItem("idbrf_demo_token")).toBe("fake-jwt");
    expect(events).toEqual([]);
    expect(loginFailureMessage(await apiLogin("ana@example.test", "x", { timeoutMs: 20 }).catch(error => error)))
      .toBe("O serviço de acesso demorou para responder. Tente novamente.");
  });

  it("401 encerra a sessão e avisa a interface; 403 preserva", async () => {
    const sessionStorage = fakeStorage();
    sessionStorage.setItem("idbrf_demo_token", "fake-jwt");
    const events: string[] = [];
    vi.stubGlobal("window", {
      sessionStorage,
      dispatchEvent: (event: Event) => { events.push(event.type); return true; },
    });
    rememberValidatedSession("fake-jwt", sessionUser);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 403 })));
    await expect(apiGet("/memberships", "fake-jwt")).rejects.toMatchObject({ kind: "forbidden" });
    expect(sessionStorage.getItem("idbrf_demo_token")).toBe("fake-jwt");
    expect(readValidatedSession("fake-jwt")).toMatchObject({ email: "ana@example.test" });
    expect(events).toEqual([]);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 401 })));
    await expect(apiGet("/memberships", "fake-jwt")).rejects.toThrow("GET /memberships falhou (401)");
    expect(sessionStorage.getItem("idbrf_demo_token")).toBeNull();
    expect(readValidatedSession("fake-jwt", Date.now(), true)).toBeNull();
    expect(events).toEqual([SESSION_UNAUTHORIZED_EVENT]);
  });

  it("só trata 401 como sessão inválida", () => {
    expect(isInvalidSession(new ApiRequestError("expirada", 401, "unauthorized"))).toBe(true);
    expect(isInvalidSession(new ApiRequestError("negado", 403, "forbidden"))).toBe(false);
    expect(isInvalidSession(new ApiRequestError("tempo", null, "timeout"))).toBe(false);
    expect(isInvalidSession(new ApiRequestError("rede", null, "network"))).toBe(false);
    expect(isInvalidSession(new Error("401"))).toBe(false);
  });

  it("mede p50 e p95 sem contar leitura em cache", () => {
    expect(percentile([], 50)).toBeNull();
    expect(percentile([10, 20, 30, 40, 100], 50)).toBe(30);
    expect(percentile([10, 20, 30, 40, 100], 95)).toBe(100);
    expect(loginFailureMessage(Object.assign(new Error("401"), {}))).toMatch(/não autorizados/);
  });
});
