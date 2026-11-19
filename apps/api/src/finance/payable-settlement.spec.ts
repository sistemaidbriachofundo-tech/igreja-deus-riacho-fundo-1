import { BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import { FinanceService } from "./finance.service";
import type { AuthUser } from "../auth/types/auth-user";

describe("baixa de conta a pagar", () => {
  const pilot = {
    organizationId: "org1", churchId: "church-rf1",
    organizationSlug: "igreja-de-deus", churchSlug: "riacho-fundo-1", churchName: "Riacho Fundo I (demo)",
  };
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  const treasurer: AuthUser = {
    userId: "u-tesoura", personId: "p-tesoura", email: "tesouraria.demo@example.test",
    grants: [{ roleCode: "TESOURARIA", organizationId: "org1", churchId: "church-rf1" }],
  };
  const otherTreasury: AuthUser = {
    ...treasurer, userId: "u-outra",
    grants: [{ roleCode: "TESOURARIA", organizationId: "org1", churchId: "outra" }],
  };
  const member: AuthUser = {
    userId: "u-mem", personId: "p-mem", email: "membro.demo@example.test",
    grants: [{ roleCode: "MEMBRO", organizationId: "org1", churchId: "church-rf1" }],
  };

  function line(side: string, accountId: string, type: string, code: string) {
    return { side, accountId, amountCents: 8000, account: { type, code } };
  }

  function harness() {
    const payable = {
      id: "pagar", status: "APPROVED", reversalOfEntryId: null, amountCents: 8000,
      description: "Conta fictícia", fundId: null, costCenterId: null,
      entryDate: new Date(`${today}T00:00:00.000Z`),
      lines: [line("DEBIT", "exp", "EXPENSE", "5.1"), line("CREDIT", "pay", "LIABILITY", "2.1")],
    };
    const cashExpense = {
      ...payable, id: "caixa", description: "Despesa de caixa",
      lines: [line("DEBIT", "exp", "EXPENSE", "5.1"), line("CREDIT", "bank", "ASSET", "1.1")],
    };
    const existing = {
      id: "baixa-pronta", status: "APPROVED", reversalOfEntryId: null, amountCents: 8000,
      fundId: null, costCenterId: null, entryDate: new Date(`${today}T00:00:00.000Z`),
      lines: [line("DEBIT", "pay", "LIABILITY", "2.1"), line("CREDIT", "bank", "ASSET", "1.1.01")],
    };
    const rows = new Map<string, Record<string, unknown>>([
      [payable.id, payable],
      ["pagar-2", { ...payable, id: "pagar-2" }],
      ["pagar-3", { ...payable, id: "pagar-3" }],
      [cashExpense.id, cashExpense],
      [existing.id, existing],
    ]);
    const logs: Array<{ resourceId: string; metadata: { settlementId: string; method: string } }> = [];
    let created = 0;
    const tx = {
      $executeRaw: jest.fn(),
      accountingPeriod: { findFirst: jest.fn().mockResolvedValue(null) },
      ledgerAccount: { findFirst: jest.fn().mockResolvedValue({ id: "bank", type: "ASSET", code: "1.1.01", active: true }) },
      ledgerEntry: {
        findFirst: jest.fn(async ({ where }: { where: { id?: string } }) => rows.get(where.id ?? "") ?? null),
        findMany: jest.fn(async ({ where }: { where: { id?: { in: string[] } } }) => (
          (where.id?.in ?? []).flatMap(id => {
            const row = rows.get(id);
            return row?.status === "APPROVED" ? [{ id, entryDate: row.entryDate }] : [];
          })
        )),
        create: jest.fn(async ({ data }: { data: { entryDate: Date } }) => {
          created += 1;
          const row = { id: `baixa-${created}`, status: "APPROVED", entryDate: data.entryDate };
          rows.set(row.id, row);
          return row;
        }),
      },
      auditLog: {
        findMany: jest.fn(async ({ where }: { where: { resourceId?: { in: string[] } } }) => (
          logs.filter(log => where.resourceId?.in.includes(log.resourceId))
        )),
        findFirst: jest.fn(async ({ where }: { where: { metadata?: { equals: string } } }) => (
          logs.find(log => log.metadata.settlementId === where.metadata?.equals) ?? null
        )),
        create: jest.fn(async ({ data }: { data: { resourceId: string; metadata: { settlementId: string; method: string } } }) => {
          logs.push({ resourceId: data.resourceId, metadata: data.metadata });
          return data;
        }),
      },
    };
    const service = new FinanceService(
      { ...tx, $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx) } as never,
      { getPilotChurch: async () => pilot } as never,
      {} as never,
    );
    return { service, tx, created: () => created };
  }

  it("registra a baixa externa uma vez e não reaproveita o mesmo pagamento em outra conta", async () => {
    const { service, created } = harness();
    const first = await service.markPayablePaid(treasurer, "pagar", { method: "EXTERNAL", paidOn: today, cashAccountId: "bank" });
    const second = await service.markPayablePaid(treasurer, "pagar", { method: "EXTERNAL", paidOn: today, cashAccountId: "bank" });
    expect(first).toEqual({ settlementId: "baixa-1", method: "EXTERNAL", paidOn: today });
    expect(second).toEqual(first);
    expect(created()).toBe(1);

    const linked = await service.markPayablePaid(treasurer, "pagar-2", { method: "EXISTING", settlementId: "baixa-pronta" });
    expect(linked.settlementId).toBe("baixa-pronta");
    await expect(service.markPayablePaid(treasurer, "pagar-3", { method: "EXISTING", settlementId: "baixa-pronta" }))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it("recusa despesa de caixa e papéis sem tesouraria desta congregação", async () => {
    const { service, tx } = harness();
    await expect(service.markPayablePaid(treasurer, "caixa", { method: "CASH", paidOn: today, cashAccountId: "bank" }))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.markPayablePaid(member, "pagar", { method: "EXTERNAL", paidOn: today, cashAccountId: "bank" }))
      .rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.markPayablePaid(otherTreasury, "pagar", { method: "EXTERNAL", paidOn: today, cashAccountId: "bank" }))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
  });
});
