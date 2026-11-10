import { attributeMinistryCost } from "./ministry-cost";

const jovens = { id: "m-jovens", name: "Jovens", slug: "jovens" };
const homens = { id: "m-homens", name: "Homens", slug: "homens" };

describe("attributeMinistryCost", () => {
  it("deixa o custo nulo quando o centro não usa o identificador do ministério", () => {
    const result = attributeMinistryCost({
      ministries: [jovens],
      costCenters: [{ id: "cc-adm", code: "ADM" }],
      entries: [
        {
          status: "APPROVED",
          costCenterId: "cc-adm",
          entryDate: new Date("2026-11-02"),
          lines: [
            {
              side: "DEBIT",
              amountCents: 5000,
              accountType: "EXPENSE",
              accountCode: "5.1.01",
            },
          ],
        },
      ],
    });
    expect(result.rows[0]).toMatchObject({
      attributed: false,
      expenseCents: null,
      approvedEntries: null,
    });
    expect(result.series).toEqual([]);
    expect(result.seriesMatch).toBe(true);
    expect(JSON.stringify(result)).not.toContain("5000");
  });

  it("soma a despesa aprovada, ignora rascunho e taxa, e confere a série", () => {
    const result = attributeMinistryCost({
      ministries: [jovens, homens],
      costCenters: [
        { id: "cc-jovens", code: "jovens" },
        { id: "cc-homens", code: "Homens" },
      ],
      entries: [
        {
          status: "APPROVED",
          costCenterId: "cc-jovens",
          entryDate: new Date("2026-11-02"),
          lines: [
            { side: "DEBIT", amountCents: 8000, accountType: "EXPENSE", accountCode: "5.1.01" },
            { side: "CREDIT", amountCents: 1000, accountType: "EXPENSE", accountCode: "5.1.01" },
            { side: "DEBIT", amountCents: 9000, accountType: "EXPENSE", accountCode: "5.9.01" },
            { side: "DEBIT", amountCents: 4000, accountType: "ASSET", accountCode: "1.1.01" },
          ],
        },
        {
          status: "DRAFT",
          costCenterId: "cc-jovens",
          entryDate: new Date("2026-11-03"),
          lines: [
            { side: "DEBIT", amountCents: 9999, accountType: "EXPENSE", accountCode: "5.1.01" },
          ],
        },
        {
          status: "REVERSED",
          costCenterId: "cc-homens",
          entryDate: new Date("2026-11-04"),
          lines: [
            { side: "DEBIT", amountCents: 3000, accountType: "EXPENSE", accountCode: "5.1.01" },
          ],
        },
        {
          status: "APPROVED",
          costCenterId: "cc-homens",
          entryDate: new Date("2026-11-04"),
          lines: [
            { side: "CREDIT", amountCents: 3000, accountType: "EXPENSE", accountCode: "5.1.01" },
          ],
        },
      ],
      from: new Date("2026-11-01"),
      to: new Date("2026-11-30"),
    });
    expect(result.rows[0]).toMatchObject({
      attributed: true,
      expenseCents: 7000,
      approvedEntries: 1,
    });
    expect(result.rows[1]).toMatchObject({
      attributed: true,
      expenseCents: -3000,
      approvedEntries: 1,
    });
    expect(result.series).toEqual([
      { label: "Jovens", expenseCents: 7000 },
      { label: "Homens", expenseCents: -3000 },
    ]);
    expect(result.seriesMatch).toBe(true);
  });

  it("zero consultado permanece zero quando o vínculo existe e não há lançamento", () => {
    const result = attributeMinistryCost({
      ministries: [jovens],
      costCenters: [{ id: "cc-jovens", code: "jovens" }],
      entries: [],
    });
    expect(result.rows[0]?.expenseCents).toBe(0);
    expect(result.rows[0]?.approvedEntries).toBe(0);
    expect(result.series).toEqual([{ label: "Jovens", expenseCents: 0 }]);
  });
});
