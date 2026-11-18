import { parseMercadoPagoReleases } from "./mercado-pago-releases";

const header = "DATE;RECORD_TYPE;SOURCE_ID;DESCRIPTION;NET_CREDIT_AMOUNT;NET_DEBIT_AMOUNT;CURRENCY";
const date = "2026-11-18T12:30:00-0300";

describe("relatório de liberações do Mercado Pago", () => {
  it("preserva entradas, saídas e identificadores e ignora saldos", async () => {
    const csv = [
      header,
      ";initial_available_balance;invalid;;0;0;BRL",
      `${date};release;A1;"venda; Pix";"12,90";0;BRL`,
      `${date};release;A1;refund;0;2.10;BRL`,
      ";total;;;12.90;2.10;BRL",
    ].join("\n");
    const result = await parseMercadoPagoReleases(csv);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ amountCents: 1290, postedAt: "2026-11-18T15:30:00.000Z" });
    expect(result[1]).toMatchObject({ amountCents: -210 });
    expect(result[0].externalRef).not.toBe(result[1].externalRef);
    await expect(parseMercadoPagoReleases(csv)).resolves.toEqual(result);
  });

  it.each([
    "campo,outro\nvalor,abc",
    header + "\n" + `${date};release;A1;venda;10;0;USD`,
    header + "\n" + `${date};release;A1;venda;1e2;0;BRL`,
    header + "\n" + `${date};release;A1;venda;5;0`,
  ])("rejeita arquivos incompatíveis sem importar parcialmente", async csv => {
    await expect(parseMercadoPagoReleases(csv)).rejects.toThrow(/relatório de liberações/);
  });
});
