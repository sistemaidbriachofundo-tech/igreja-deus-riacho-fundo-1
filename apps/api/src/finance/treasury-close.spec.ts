import { ForbiddenException } from "@nestjs/common";
import type { AuthUser } from "../auth/types/auth-user";
import { FinanceService } from "./finance.service";

const pilot = {
  organizationId: "org1",
  churchId: "church-rf1",
  organizationSlug: "igreja-de-deus",
  churchSlug: "riacho-fundo-1",
  churchName: "Riacho Fundo I (demo)",
};

function actor(role: string): AuthUser {
  return {
    userId: "u-" + role,
    personId: "p-" + role,
    email: role.toLowerCase() + "@example.test",
    grants: [{ roleCode: role as AuthUser["grants"][number]["roleCode"], organizationId: pilot.organizationId, churchId: pilot.churchId }],
  };
}

const now = new Date("2026-11-06T12:00:00.000Z");

function entry(id: string, lines: Array<{ side: string; accountId: string; type: string; code: string }>) {
  return {
    id,
    churchId: pilot.churchId,
    entryDate: now,
    description: "Despesa " + id,
    status: "APPROVED",
    amountCents: 1000,
    createdByUserId: "u-TESOURARIA",
    submittedAt: now,
    firstApprovedByUserId: "u-TESOURARIA",
    firstApprovedAt: now,
    secondApprovedByUserId: "u-PASTOR",
    secondApprovedAt: now,
    rejectedByUserId: null,
    rejectedAt: null,
    rejectionReason: null,
    reversalOfEntryId: null,
    importBatchId: null,
    reconciliationId: null,
    fundId: null,
    costCenterId: "cc",
    competenceYear: 2026,
    competenceMonth: 11,
    createdAt: now,
    updatedAt: now,
    lines: lines.map((line, index) => ({
      id: id + index,
      accountId: line.accountId,
      side: line.side,
      amountCents: 1000,
      memo: null,
      account: { type: line.type, code: line.code },
    })),
  };
}

describe("fechamento da tesouraria", () => {
  const treasurer = actor("TESOURARIA");
  const admin = actor("PLATFORM_ADMIN");
  const leader = actor("LIDER_MINISTERIO");

  it("impede líder de ministério e administrador de operar a baixa", async () => {
    const service = new FinanceService({} as never, { getPilotChurch: async () => pilot } as never, {} as never);
    await expect(service.listAccounts(leader)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.balances(leader)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.exportStatement(leader, "pdf")).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.markPayablePaid(admin, "ap", { method: "EXTERNAL", paidOn: "2026-11-06" })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("separa contas a pagar de despesas já reconhecidas no caixa", async () => {
    const rows = [
      entry("pagar", [
        { side: "DEBIT", accountId: "desp", type: "EXPENSE", code: "5.1.01" },
        { side: "CREDIT", accountId: "ap", type: "LIABILITY", code: "2.1.01" },
      ]),
      entry("caixa", [
        { side: "DEBIT", accountId: "desp", type: "EXPENSE", code: "5.1.01" },
        { side: "CREDIT", accountId: "banco", type: "ASSET", code: "1.1.10.01" },
      ]),
    ];
    const service = new FinanceService({
      ledgerEntry: { findMany: async () => rows },
      auditLog: { findMany: async () => [] },
    } as never, { getPilotChurch: async () => pilot } as never, {} as never);
    const payables = await service.listEntries(treasurer, undefined, "payables");
    const settled = await service.listEntries(treasurer, undefined, "settled");
    expect(payables.entries.map(item => item.id)).toEqual(["pagar"]);
    expect(settled.entries.map(item => item.id)).toEqual(["caixa"]);
  });

  it("exporta PDF e Excel sem consultar banco", async () => {
    const service = new FinanceService({
      ledgerEntry: { findMany: async () => [] },
    } as never, { getPilotChurch: async () => pilot } as never, {} as never);
    const pdf = await service.exportStatement(treasurer, "pdf");
    const sheet = await service.exportStatement(admin, "xls");
    expect(pdf.contentType).toBe("application/pdf");
    expect(pdf.bytes.subarray(0, 4).toString()).toBe("%PDF");
    expect(sheet.bytes.toString("utf8")).toContain("Extrato");
    expect(sheet.bytes.toString("utf8")).not.toContain("http");
  });

  it("descarta linha repetida e neutraliza fórmula do CSV", async () => {
    const created: Array<{ description: string; externalRef: string | null }> = [];
    const tx = {
      bankImportBatch: {
        create: async ({ data }: { data: { lines: { create: Array<{ description: string; externalRef: string | null }> } } }) => {
          created.push(...data.lines.create);
          return {
            id: "batch", churchId: pilot.churchId, format: "CSV", status: "PARSED", filename: "extrato.csv",
            stubNote: null, lineCount: data.lines.create.length, createdByUserId: treasurer.userId,
            createdAt: now, updatedAt: now, lines: [],
          };
        },
      },
      auditLog: { create: async () => ({}) },
    };
    const service = new FinanceService({
      $transaction: async (fn: (value: typeof tx) => Promise<unknown>) => fn(tx),
    } as never, { getPilotChurch: async () => pilot } as never, {} as never);
    await service.createImport(treasurer, {
      format: "CSV",
      filename: "extrato.csv",
      textContent: "2026-11-01,25000,Oferta,FIT-1\n2026-11-01,25000,Oferta,FIT-1\n2026-11-02,10,=cmd",
    });
    expect(created.map(line => line.description)).toEqual(["Oferta", "'=cmd"]);
    expect(created[1].externalRef).toBeNull();
  });
});
