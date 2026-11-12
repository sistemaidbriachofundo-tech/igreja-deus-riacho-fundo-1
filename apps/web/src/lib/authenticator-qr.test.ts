import { describe, expect, it, vi } from "vitest";
import { generateAuthenticatorQr } from "./authenticator-qr";

vi.mock("qrcode", () => ({ toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,LOCAL_ONLY") }));

describe("QR de cadastro do autenticador", () => {
  const uri = "otpauth://totp/ID%20Riacho%201:admin%40example.test?secret=JBSWY3DPEHPK3PXP&issuer=ID%20Riacho%201";

  it("gera imagem local com URI TOTP fornecida pela API, nunca URL externa", async () => {
    const { toDataURL } = await import("qrcode");
    await expect(generateAuthenticatorQr(uri)).resolves.toMatch(/^data:image\/png/);
    expect(toDataURL).toHaveBeenCalledWith(uri, expect.objectContaining({ width: 220, margin: 2 }));
  });

  it.each([
    "https://example.test/qr?secret=123",
    "otpauth://hotp/Example?secret=JBSWY3DPEHPK3PXP",
    "otpauth://totp/Example?issuer=ID",
    "otpauth://totp/?secret=JBSWY3DPEHPK3PXP",
    "otpauth://totp/Example?secret=JBSWY3DPEHPK3PXP" + "a".repeat(2048),
  ])("rejeita formato ou extensão inválidos sem acessar gerador", async value => {
    const { toDataURL } = await import("qrcode");
    vi.mocked(toDataURL).mockClear();
    await expect(generateAuthenticatorQr(value)).rejects.toThrow("URI de autenticador inválida");
    expect(toDataURL).not.toHaveBeenCalled();
  });
});
