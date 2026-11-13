import { afterEach, describe, expect, it, vi } from "vitest";
import { credentialScanUrl, credentialTokenFromHash } from "./credential-scan";

const token = "Q3JlZGVuY2lhbFByZXZpZXdUb2tlblNlbVBJSVllcw";

afterEach(() => vi.unstubAllEnvs());

describe("QR de carteirinha pelo celular", () => {
  it("abre o próprio portal e guarda só o token opaco no fragmento", () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "/igreja-deus-riacho-fundo-1");
    const value = credentialScanUrl("https://portal.example.test", token);
    expect(value).toBe(`https://portal.example.test/igreja-deus-riacho-fundo-1/validar-carteirinha/#${token}`);
    const url = new URL(value!);
    expect(url.search).toBe("");
    expect(credentialTokenFromHash(url.hash)).toBe(token);
  });

  it("rejeita contatos, caminhos e identificadores inadequados", () => {
    expect(credentialScanUrl("https://portal.example.test", "contato@example.test")).toBeNull();
    expect(credentialTokenFromHash("#https://example.test/")).toBeNull();
    expect(credentialTokenFromHash("#curto")).toBeNull();
    expect(credentialTokenFromHash(token)).toBeNull();
  });
});

describe("consulta pública da carteirinha", () => {
  it("não envia a sessão nem guarda o token no diagnóstico de requisições", async () => {
    const { clearApiTimings, readApiTimings } = await import("./api");
    const { verifyCredentialQr } = await import("../components/credentials/credential-api");
    const request = vi.fn().mockResolvedValue(Response.json({
      status: "ACTIVE", valid: true, displayName: "Pessoa de teste",
    }));
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test");
    vi.stubGlobal("fetch", request);
    clearApiTimings();
    try {
      await expect(verifyCredentialQr(token)).resolves.toEqual({
        state: "valid", label: "QR confirmado. Credencial ativa.",
      });
      expect(request).toHaveBeenCalledWith(`https://api.example.test/credentials/verify/${token}`,
        expect.objectContaining({ headers: {}, cache: "no-store", credentials: "omit" }));
      expect(readApiTimings().at(-1)?.path).toBe("/credentials/verify/:token");
    } finally {
      clearApiTimings();
      vi.unstubAllGlobals();
    }
  });

  it("não interpreta uma resposta contraditória como credencial válida", async () => {
    const { verifyCredentialQr } = await import("../components/credentials/credential-api");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ status: "REVOKED", valid: true })));
    try {
      await expect(verifyCredentialQr(token)).resolves.toMatchObject({ state: "unknown" });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
