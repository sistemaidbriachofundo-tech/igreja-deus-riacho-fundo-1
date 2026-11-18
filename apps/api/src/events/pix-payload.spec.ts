import { buildPixCopiaECola, pixCrc16 } from "./pix-payload";

describe("Pix da conta da igreja", () => {
  it("monta um BR Code com o valor e o checksum, sem gateway", () => {
    const payload = buildPixCopiaECola({
      pixKey: "evento.teste@example.test",
      merchantName: "Igreja Riacho",
      merchantCity: "Brasília",
      amountCents: 1500,
      txid: "abc123",
    });
    expect(payload.startsWith("000201")).toBe(true);
    expect(payload).toContain("evento.teste@example.test");
    expect(payload).toContain("15.00");
    expect(payload).toContain("Brasilia");
    expect(payload.slice(-4)).toBe(pixCrc16(payload.slice(0, -4)));
    expect(payload).not.toMatch(/mercado ?pago|gateway/i);
    expect(() => buildPixCopiaECola({
      pixKey: "evento.teste@example.test",
      merchantName: "Igreja",
      merchantCity: "Brasilia",
      amountCents: 0,
      txid: "abc",
    })).toThrow(/Valor Pix/);
  });
});
