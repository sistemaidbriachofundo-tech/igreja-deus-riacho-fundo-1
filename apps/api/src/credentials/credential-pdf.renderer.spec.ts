import {
  generateOpaqueCredentialToken,
  containsSensitiveCredentialPayload,
} from "@idbrf/shared";
import { credentialPdfQrPayload, renderCredentialPdf } from "./credential-pdf.renderer";

describe("renderCredentialPdf", () => {
  it("monta URL escaneável usando o prefixo web e um fragmento opaco", () => {
    const token = generateOpaqueCredentialToken();
    expect(credentialPdfQrPayload(token, "https://dev.example.test/igreja"))
      .toBe(`https://dev.example.test/igreja/validar-carteirinha/#${token}`);
    expect(() => credentialPdfQrPayload(token, "http://dev.example.test")).toThrow();
  });

  it("produces a real PDF with %PDF header and opaque QR only", async () => {
    const opaqueToken = generateOpaqueCredentialToken();
    const pdf = await renderCredentialPdf({
      displayName: "Bruno Demo",
      churchName: "Riacho Fundo I (demo)",
      opaqueToken,
      issuedAt: new Date("2026-11-04T12:00:00Z"),
      credentialId: "c1",
    });

    expect(pdf.subarray(0, 4).toString("ascii")).toBe("%PDF");
    expect(pdf.byteLength).toBeGreaterThan(500);
    // Streams podem vir comprimidos — validar header + ausência de CPF formatado.
    expect(pdf.toString("latin1")).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/);
    expect(
      containsSensitiveCredentialPayload(
        ["Bruno Demo", "Riacho Fundo I (demo)", opaqueToken].join("\n"),
      ),
    ).toBe(false);
  });

  it("rejects displayName that looks like CPF", async () => {
    await expect(
      renderCredentialPdf({
        displayName: "123.456.789-09",
        churchName: "Igreja Demo",
        opaqueToken: generateOpaqueCredentialToken(),
        issuedAt: new Date(),
        credentialId: "c1",
      }),
    ).rejects.toThrow(/sensível|CPF/i);
  });

  it("rejects churchName with phone-like PII", async () => {
    await expect(
      renderCredentialPdf({
        displayName: "Bruno Demo",
        churchName: "Igreja 11987654321",
        opaqueToken: generateOpaqueCredentialToken(),
        issuedAt: new Date(),
        credentialId: "c1",
      }),
    ).rejects.toThrow(/sensível|Campo churchName/i);
  });
});
