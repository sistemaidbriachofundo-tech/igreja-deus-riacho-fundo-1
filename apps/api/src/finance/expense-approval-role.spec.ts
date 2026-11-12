import { ConflictException, ForbiddenException } from "@nestjs/common";
import { FinanceService } from "./finance.service";
import type { AuthUser } from "../auth/types/auth-user";

const scope = { organizationId: "org-rf1", churchId: "church-rf1" };
const actor = (id: string, roleCode: string): AuthUser => ({
  userId: id, personId: "person-" + id, email: id + "@example.test",
  grants: [{ roleCode: roleCode as never, ...scope }], ...scope,
});
const treasurer = actor("tesoureiro", "TESOURARIA");
const pastor = actor("pastor", "PASTOR");
const submitter = actor("lancador", "TESOURARIA");
const date = new Date("2026-11-12T12:00:00Z");

function row(firstApprovedByUserId: string | null = null) {
  return {
    id: "expense-test", organizationId: scope.organizationId, churchId: scope.churchId,
    entryDate: date, createdAt: date, updatedAt: date,
    description: "Conta de energia", status: "PENDING_APPROVAL",
    amountCents: 27550, createdByUserId: submitter.userId, submittedAt: date,
    firstApprovedByUserId, firstApprovedAt: firstApprovedByUserId ? date : null,
    secondApprovedByUserId: null, secondApprovedAt: null,
    rejectedByUserId: null, rejectedAt: null, rejectionReason: null,
    reversalOfEntryId: null, importBatchId: null, reconciliationId: null,
    fundId: null, costCenterId: null, competenceYear: 2026, competenceMonth: 11,
    lines: [
      { id: "debit", accountId: "energy", side: "DEBIT", amountCents: 27550,
        memo: "treasury:expense", account: { type: "EXPENSE", code: "5.1.10.01" } },
      { id: "credit", accountId: "bank", side: "CREDIT", amountCents: 27550,
        memo: "treasury:cash", account: { type: "ASSET", code: "1.1.10.01" } },
    ],
    reversedBy: null,
  };
}

function setup(entry: ReturnType<typeof row>) {
  const updated = {
    ...entry,
    firstApprovedByUserId: entry.firstApprovedByUserId ?? treasurer.userId,
    firstApprovedAt: date,
    ...(entry.firstApprovedByUserId ? { secondApprovedByUserId: pastor.userId, secondApprovedAt: date, status: "APPROVED" } : {}),
  };
  const tx = {
    ledgerEntry: { update: jest.fn().mockResolvedValue(updated) },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    ledgerEntry: { findFirst: jest.fn().mockResolvedValue(entry) },
    $transaction: jest.fn(async (work: (data: typeof tx) => Promise<unknown>) => work(tx)),
  };
  const service = new FinanceService(prisma as never,
    { getPilotChurch: jest.fn().mockResolvedValue(scope) } as never,
    {} as never);
  return { service, prisma, tx };
}

describe("Governança de despesas — Tesoureiro seguido do Pastor", () => {
  it("bloqueia pastor na primeira etapa e criador na sua própria aprovação", async () => {
    const { service, prisma } = setup(row());
    await expect(service.approveEntry(pastor, "expense-test")).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.approveEntry(submitter, "expense-test")).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("permite a primeira aprovação à Tesouraria sem entrar em APPROVED", async () => {
    const { service, tx } = setup(row());
    const result = await service.approveEntry(treasurer, "expense-test");
    expect(result.status).toBe("PENDING_APPROVAL");
    expect(result.approvalFlow).toBe("TREASURER_THEN_PASTOR");
    expect(result.firstApprovedByUserId).toBe(treasurer.userId);
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: "ledger.entry.approve.first" }),
    }));
  });

  it("impede outro tesoureiro na segunda etapa e permite apenas pastor diferente", async () => {
    const { service, prisma, tx } = setup(row(treasurer.userId));
    await expect(service.approveEntry(actor("outro-tesoureiro", "TESOURARIA"), "expense-test"))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    const result = await service.approveEntry(pastor, "expense-test");
    expect(result.status).toBe("APPROVED");
    expect(result.secondApprovedByUserId).toBe(pastor.userId);
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: "ledger.entry.approve.second" }),
    }));
  });

  it("nega outra congregação mesmo com papel Pastor", async () => {
    const { service } = setup(row(treasurer.userId));
    await expect(service.approveEntry({ ...pastor, churchId: "outra" }, "expense-test"))
      .rejects.toBeInstanceOf(ForbiddenException);
  });
});
