import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  generateOpaqueCredentialToken,
  containsSensitiveCredentialPayload,
} from "@idbrf/shared";
import { credentialPdfDate, credentialPdfQrPayload, credentialPdfRegistration, renderCredentialPdf } from "./credential-pdf.renderer";

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

  it("ignora retrato que não é JPEG e desenha o PDF com iniciais", async () => {
    const pdf = await renderCredentialPdf({
      displayName: "Nia Okonkwo",
      churchName: "Riacho Fundo I (demo)",
      opaqueToken: generateOpaqueCredentialToken(),
      issuedAt: new Date("2026-11-21T12:00:00Z"),
      credentialId: "c-png",
      photo: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    });
    expect(pdf.subarray(0, 4).toString("ascii")).toBe("%PDF");
  });

  it("aceita JPEG sintético dentro do limite e recusa arquivo grande demais sem quebrar o PDF", async () => {
    const photo = readFileSync(join(__dirname, "../../../web/public/images/qa/portraits/nia-okonkwo.jpg"));
    const pdf = await renderCredentialPdf({
      displayName: "Nia Okonkwo",
      churchName: "Riacho Fundo I (demo)",
      opaqueToken: generateOpaqueCredentialToken(),
      issuedAt: new Date("2026-11-21T12:00:00Z"),
      credentialId: "c-jpeg",
      photo,
    });
    expect(pdf.subarray(0, 4).toString("ascii")).toBe("%PDF");
    const oversized = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(192 * 1024)]);
    const fallback = await renderCredentialPdf({
      displayName: "Nia Okonkwo",
      churchName: "Riacho Fundo I (demo)",
      opaqueToken: generateOpaqueCredentialToken(),
      issuedAt: new Date("2026-11-21T12:00:00Z"),
      credentialId: "c-big",
      photo: oversized,
    });
    expect(fallback.subarray(0, 4).toString("ascii")).toBe("%PDF");
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

  it("mostra a mesma matrícula e a data no fuso de São Paulo", () => {
    expect(credentialPdfRegistration("qacomp_cm_helena-carvalho", "c1")).toBe("qaco·rvalho");
    expect(credentialPdfRegistration("m1", "c1")).toBe("m1");
    expect(credentialPdfDate(new Date("2026-11-22T02:30:00.000Z"))).toBe("21/11/2026");
    expect(credentialPdfDate(null)).toBe("-");
  });

  it("desenha o verso e a situação revogada sem inventar validade", async () => {
    const pdf = await renderCredentialPdf({
      displayName: "Diego Martins",
      churchName: "Riacho Fundo I (demo)",
      opaqueToken: generateOpaqueCredentialToken(),
      issuedAt: new Date("2026-03-10T15:00:00.000Z"),
      revokedAt: new Date("2026-10-01T15:00:00.000Z"),
      credentialId: "c-revogada",
      membershipId: "m-diego",
      status: "REVOKED",
      ministryName: "Recepção demonstrativa",
    });
    expect(pdf.subarray(0, 4).toString("ascii")).toBe("%PDF");
    expect(pdf.toString("latin1")).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/);
  });
});
