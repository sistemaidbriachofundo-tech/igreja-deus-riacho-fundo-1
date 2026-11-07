import { renderLetterPdf } from "./letter-pdf.renderer";

describe("renderLetterPdf", () => {
  it("produces a PDF without structured PII", async () => {
    const pdf = await renderLetterPdf({
      churchName: "Riacho Fundo I (demo)",
      letterType: "RECOMENDACAO",
      title: "Carta de recomendação",
      bodyText: "Recomendamos o membro fictício para comunhão fraterna.",
      displayName: "Bruno Demo",
      version: 2,
      letterId: "L-demo-1",
      issuedAt: new Date("2026-11-07T12:00:00Z"),
    });

    expect(pdf.subarray(0, 4).toString("ascii")).toBe("%PDF");
    expect(pdf.byteLength).toBeGreaterThan(500);
    // Defesa: CPF formatado não deve aparecer no stream textual
    expect(pdf.toString("latin1")).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/);
  });

  it("rejects CPF in structured fields or body", async () => {
    await expect(
      renderLetterPdf({
        churchName: "Igreja",
        letterType: "MEMBRESIA",
        title: "Ok",
        bodyText: "Texto",
        displayName: "123.456.789-09",
        version: 1,
        letterId: "L1",
        issuedAt: null,
      }),
    ).rejects.toThrow(/sensível|CPF/i);

    await expect(
      renderLetterPdf({
        churchName: "Igreja",
        letterType: "OUTRO",
        title: "Ok",
        bodyText: "Documento CPF 123.456.789-09 anexado",
        displayName: "Ana Demo",
        version: 1,
        letterId: "L2",
        issuedAt: null,
      }),
    ).rejects.toThrow(/CPF/i);
  });
});
