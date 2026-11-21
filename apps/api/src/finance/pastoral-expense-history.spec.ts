import { ForbiddenException } from "@nestjs/common";
import { FinanceService } from "./finance.service";
import type { AuthUser } from "../auth/types/auth-user";

describe("histórico pastoral de despesas", () => {
  const pilot = {
    organizationId: "org1", churchId: "church-rf1",
    organizationSlug: "igreja-de-deus", churchSlug: "riacho-fundo-1", churchName: "Riacho Fundo I (demo)",
  };
  const now = new Date("2026-11-19T15:00:00.000Z");
  const pastor: AuthUser = {
    userId: "u-pastor", personId: "p-pastor", email: "pastor.demo@example.test", churchId: "church-rf1", organizationId: "org1",
    grants: [{ roleCode: "PASTOR", organizationId: "org1", churchId: "church-rf1" }],
  };
  const treasurer: AuthUser = {
    userId: "u-tesoura", personId: "p-tesoura", email: "tesouraria.demo@example.test",
    grants: [{ roleCode: "TESOURARIA", organizationId: "org1", churchId: "church-rf1" }],
  };
  const admin: AuthUser = {
    userId: "u-admin", personId: "p-admin", email: "admin.demo@example.test",
    grants: [{ roleCode: "PLATFORM_ADMIN", organizationId: "org1", churchId: null }],
  };
  const member: AuthUser = {
    userId: "u-mem", personId: "p-mem", email: "membro.demo@example.test",
    grants: [{ roleCode: "MEMBRO", organizationId: "org1", churchId: "church-rf1" }],
  };
  const otherPastor: AuthUser = {
    ...pastor, userId: "u-outro", churchId: "outra",
    grants: [{ roleCode: "PASTOR", organizationId: "org1", churchId: "outra" }],
  };

  function entry(id: string, status: string, extra: Record<string, unknown> = {}) {
    return {
      id, organizationId: pilot.organizationId, churchId: pilot.churchId,
      entryDate: new Date("2026-11-10"), description: "Despesa fictícia", status, amountCents: 12345,
      createdByUserId: "u-tesoura", submittedAt: now, firstApprovedByUserId: "u-tesoura", firstApprovedAt: now,
      secondApprovedByUserId: status === "APPROVED" ? "u-pastor" : null,
      secondApprovedAt: status === "APPROVED" ? now : null,
      rejectedByUserId: status === "REJECTED" ? "u-pastor" : null,
      rejectedAt: status === "REJECTED" ? now : null,
      rejectionReason: status === "REJECTED" ? "devolver" : null,
      reversalOfEntryId: null, importBatchId: null, reconciliationId: null,
      fundId: null, costCenterId: null, competenceYear: 2026, competenceMonth: 11,
      createdAt: now, updatedAt: now,
      lines: [
        { id: `${id}-d`, accountId: "acc-despesa", side: "DEBIT", amountCents: 12345, memo: null, account: { type: "EXPENSE", code: "5.1" } },
        { id: `${id}-c`, accountId: "acc-pagar", side: "CREDIT", amountCents: 12345, memo: null, account: { type: "LIABILITY", code: "2.1" } },
      ],
      ...extra,
    };
  }

  function serviceFor(rows: ReturnType<typeof entry>[]) {
    const findMany = jest.fn(async (args: { where?: { status?: unknown }; select?: { entryDate?: boolean } }) => {
      if (args.select?.entryDate) return [{ id: "baixa-1", entryDate: new Date("2026-11-18T00:00:00.000Z") }];
      return rows;
    });
    const prisma = {
      ledgerEntry: { findMany, findFirst: jest.fn().mockResolvedValue(null) },
      auditLog: { findMany: jest.fn().mockResolvedValue([
        { resourceId: "aprovada", metadata: { settlementId: "baixa-1", method: "CASH" } },
      ]) },
    };
    const service = new FinanceService(prisma as never, { getPilotChurch: async () => pilot } as never, {} as never);
    return { service, prisma };
  }

  it("devolve ao pastor o histórico que chegou à etapa dele, com a data da baixa e sem o extrato", async () => {
    const approved = entry("aprovada", "APPROVED");
    const returned = entry("devolvida", "REJECTED");
    const { service, prisma } = serviceFor([approved, returned]);

    const history = await service.listExpenseApprovals(pastor, undefined, true) as unknown as {
      entries: Array<{
        id: string; status: string; secondApprovedAt: string | null; rejectedAt: string | null;
        payment: { paidOn: string } | null;
      }>;
    };
    expect(history.entries.map((item) => item.status)).toEqual(["APPROVED", "REJECTED"]);
    expect(history.entries[0]).toMatchObject({
      id: "aprovada",
      status: "APPROVED",
      secondApprovedAt: now.toISOString(),
      payable: true,
      payment: { paidOn: "2026-11-18" },
    });
    expect(history.entries[0].payment).not.toHaveProperty("settlementId");
    expect(history.entries[1]).toMatchObject({ status: "REJECTED", rejectedAt: now.toISOString(), payment: null });
    expect(JSON.stringify(history)).not.toMatch(/bankStatement|statementLine|accountId|acc-despesa|acc-pagar|1\.1/);
    const where = prisma.ledgerEntry.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      organizationId: "org1", churchId: "church-rf1", reversalOfEntryId: null,
      status: { in: ["PENDING_APPROVAL", "APPROVED", "REJECTED"] },
      OR: [{ firstApprovedAt: { not: null } }, { secondApprovedAt: { not: null } }],
    });

    const queue = await service.listExpenseApprovals(pastor);
    expect(queue.entries[0]).not.toHaveProperty("payment");
    const queued = prisma.ledgerEntry.findMany.mock.calls.at(-1)?.[0] as { where?: { status?: string } } | undefined;
    expect(queued?.where?.status).toBe("PENDING_APPROVAL");
    const treasury = await service.listExpenseApprovals(treasurer, undefined, true) as unknown as {
      entries: Array<{ payment: { paidOn: string } | null }>;
    };
    expect(treasury.entries[0]?.payment).toEqual({ paidOn: "2026-11-18" });
    expect(treasury.entries[1]?.payment).toBeNull();
  });

  it("recusa histórico e baixa para quem não é tesouraria ou pastor desta congregação", async () => {
    const { service, prisma } = serviceFor([]);
    await expect(service.listExpenseApprovals(member, undefined, true)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.listExpenseApprovals(admin, undefined, true)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.listExpenseApprovals(otherPastor, undefined, true)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.markPayablePaid(pastor, "aprovada", { method: "CASH", paidOn: "2026-11-18" })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.markPayablePaid(admin, "aprovada", { method: "CASH", paidOn: "2026-11-18" })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.ledgerEntry.findMany).not.toHaveBeenCalled();
  });
});
