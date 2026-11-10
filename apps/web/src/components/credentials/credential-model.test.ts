import { describe, expect, it } from "vitest";
import { ApiRequestError } from "../../lib/api";
import {
  avatarLabel,
  credentialFailure,
  interpretQr,
  registrationLabel,
  runCredentialJourney,
  safeQrSvg,
} from "./credential-model";

describe("carteirinha — rótulos e QR seguro", () => {
  it("encurta a matrícula sem trocar o identificador", () => {
    expect(registrationLabel("membership-preview-joao")).toBe("memb·ewjoao");
    expect(avatarLabel("João Silva")).toBe("JS");
  });

  it("rejeita SVG que não é só o desenho do QR", () => {
    expect(safeQrSvg("<svg></svg>")).toBe("<svg></svg>");
    expect(safeQrSvg("<svg><script>alert(1)</script></svg>")).toBeNull();
    expect(safeQrSvg("<div></div>")).toBeNull();
  });

  it("traduz 401, 403, 404 e 409 sem inventar sucesso", () => {
    expect(credentialFailure(new ApiRequestError("x", 401, "unauthorized")).status).toBe(401);
    expect(credentialFailure(new ApiRequestError("x", 403, "forbidden")).message).toMatch(/perfil não pode/);
    expect(credentialFailure(new ApiRequestError("x", 404, "http")).status).toBe(404);
    expect(credentialFailure(new ApiRequestError("Já existe carteirinha ativa", 409, "http")).message).toMatch(/Já existe/);
    expect(credentialFailure(new ApiRequestError("CREDENTIAL_NOT_ELIGIBLE", 409, "http")).message).toMatch(/aprovação pastoral/);
  });

  it("trata QR revogado como inválido", () => {
    expect(interpretQr("REVOKED", false).state).toBe("revoked");
    expect(interpretQr("ACTIVE", true).state).toBe("valid");
    expect(interpretQr("ACTIVE", false).state).toBe("revoked");
  });
});

describe("jornada abrir, baixar, imprimir, revogar e invalidar o QR", () => {
  const opened = { id: "c1", qrPayload: "token-opaco", status: "ACTIVE" };

  it("só passa quando a revogação e a conferência concordam", async () => {
    const printed: string[] = [];
    const result = await runCredentialJourney({
      open: async () => opened,
      download: async () => ({ status: 200 }),
      print: () => { printed.push("print"); },
      revoke: async () => ({ status: "REVOKED" }),
      verify: async () => ({ status: "REVOKED", valid: false }),
    });
    expect(result).toEqual({ pass: true, blockedAt: null, qrValid: false });
    expect(printed).toEqual(["print"]);
  });

  it("não declara sucesso quando o PDF responde 404", async () => {
    const result = await runCredentialJourney({
      open: async () => opened,
      download: async () => ({ status: 404 }),
      print: () => { throw new Error("não deveria imprimir"); },
      revoke: async () => ({ status: "REVOKED" }),
      verify: async () => ({ status: "REVOKED", valid: false }),
    });
    expect(result.pass).toBe(false);
    expect(result.blockedAt).toBe("download");
  });

  it("não declara sucesso se o QR continua ativo depois da revogação", async () => {
    const result = await runCredentialJourney({
      open: async () => opened,
      download: async () => ({ status: 200 }),
      print: () => {},
      revoke: async () => ({ status: "REVOKED" }),
      verify: async () => ({ status: "ACTIVE", valid: true }),
    });
    expect(result).toMatchObject({ pass: false, blockedAt: "verify", qrValid: true });
  });
});
