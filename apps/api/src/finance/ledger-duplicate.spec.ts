import { ConflictException } from "@nestjs/common";
import type { AuthUser } from "../auth/types/auth-user";
import { FinanceService } from "./finance.service";
import { reviewLedgerDuplicates, sameLedgerFingerprint } from "./ledger-duplicate";

const scope = { organizationId: "org-rf1", churchId: "church-rf1" };
const treasurer: AuthUser = {
  userId: "tesoureiro", personId: "person-tesoureiro", email: "tesoureiro@example.test",
  grants: [{ roleCode: "TESOURARIA", ...scope }], ...scope,
};

describe("impressão digital do lançamento", () => {
  const base = {
    id: "le-1", status: "PENDING_APPROVAL", description: "Conta de energia",
    entryDate: "2026-11-12", amountCents: 27550, costCenterId: "cc-1",
    lines: [
      { accountId: "energy", side: "DEBIT" },
      { accountId: "bank", side: "CREDIT" },
    ],
  };
  const incoming = {
    description: "  conta   de  energía ",
    costCenterId: "cc-1",
    lines: base.lines,
  };

  it("reconhece o mesmo lançamento e preserva os distintos", () => {
    expect(sameLedgerFingerprint(base, incoming)).toBe(true);
    expect(sameLedgerFingerprint(base, { ...incoming, description: "Conta de água" })).toBe(false);
    expect(sameLedgerFingerprint(base, { ...incoming, costCenterId: "cc-2" })).toBe(false);
    expect(sameLedgerFingerprint(base, {
      ...incoming,
      lines: [{ accountId: "other", side: "DEBIT" }, { accountId: "bank", side: "CREDIT" }],
    })).toBe(false);
    expect(sameLedgerFingerprint({ ...base, status: "REJECTED" }, incoming)).toBe(false);
    expect(sameLedgerFingerprint({ ...base, status: "REVERSED" }, incoming)).toBe(false);
  });

  it("exige revisar cada candidato novo e não aceita justificativa velha", () => {
    const second = { ...base, id: "le-2", description: "Conta de energia" };
    const fresh = reviewLedgerDuplicates({ candidates: [base, second], incoming, acknowledgedId: null });
    expect(fresh).toMatchObject({ action: "possible", reason: "new", existing: { id: "le-1" } });
    const next = reviewLedgerDuplicates({ candidates: [base, second], incoming, acknowledgedId: "le-1" });
    expect(next).toMatchObject({ action: "possible", reason: "another", existing: { id: "le-2" } });
    const stale = reviewLedgerDuplicates({ candidates: [second], incoming, acknowledgedId: "le-1" });
    expect(stale).toMatchObject({ action: "possible", reason: "stale", existing: { id: "le-2" } });
    expect(reviewLedgerDuplicates({ candidates: [base], incoming, acknowledgedId: "le-1" })).toEqual({
      action: "allow", acknowledgedId: "le-1",
    });
  });
});

describe("FinanceService duplicidade de despesa", () => {
  const saved = {
    id: "expense-d47d43a5-5775-4c53-8ef3-113696ebc820",
    ...scope,
    entryDate: new Date("2026-11-12T00:00:00.000Z"),
    description: "Conta de energia",
    status: "PENDING_APPROVAL",
    amountCents: 27550,
    createdByUserId: treasurer.userId,
    submittedAt: new Date("2026-11-12T00:00:00.000Z"),
    firstApprovedByUserId: treasurer.userId,
    firstApprovedAt: new Date("2026-11-12T00:00:00.000Z"),
    secondApprovedByUserId: null,
    secondApprovedAt: null,
    rejectedByUserId: null,
    rejectedAt: null,
    rejectionReason: null,
    reversalOfEntryId: null,
    importBatchId: null,
    reconciliationId: null,
    fundId: null,
    costCenterId: "cc-1",
    competenceYear: 2026,
    competenceMonth: 11,
    externalDocumentId: null as string | null,
    createdAt: new Date("2026-11-12T00:00:00.000Z"),
    updatedAt: new Date("2026-11-12T00:00:00.000Z"),
    lines: [
      { id: "debit", accountId: "energy", side: "DEBIT", amountCents: 27550, memo: "treasury:expense", account: { type: "EXPENSE", code: "5.1.10.01" } },
      { id: "credit", accountId: "bank", side: "CREDIT", amountCents: 27550, memo: "treasury:cash", account: { type: "ASSET", code: "1.1.10.01" } },
    ],
  };

  function harness(candidates: Array<Record<string, unknown>> = []) {
    const audits: Array<{ action: string; metadata?: unknown }> = [];
    const tx = {
      $executeRaw: jest.fn(),
      ledgerEntry: {
        create: jest.fn().mockResolvedValue(saved),
        findMany: jest.fn().mockImplementation(async ({ where }: { where: { churchId: string } }) => (
          where.churchId === scope.churchId ? candidates : []
        )),
        findFirst: jest.fn().mockImplementation(async ({ where }: { where: { id?: string; externalDocumentId?: string; churchId?: string } }) => {
          if (where.churchId && where.churchId !== scope.churchId) return null;
          if (where.externalDocumentId) return candidates.find(row => row.externalDocumentId === where.externalDocumentId) ?? null;
          if (where.id) return where.id === saved.id ? saved : null;
          return null;
        }),
      },
      auditLog: { create: jest.fn(async ({ data }: { data: { action: string; metadata?: unknown } }) => { audits.push(data); return data; }) },
    };
    const prisma = {
      accountingPeriod: { findFirst: jest.fn().mockResolvedValue(null) },
      ledgerAccount: { findMany: jest.fn().mockResolvedValue([
        { id: "energy", type: "EXPENSE", code: "5.1.10.01" },
        { id: "bank", type: "ASSET", code: "1.1.10.01" },
      ]) },
      costCenter: { findFirst: jest.fn().mockResolvedValue({ id: "cc-1", churchId: scope.churchId }) },
      ledgerEntry: tx.ledgerEntry,
      $transaction: jest.fn(async (work: (client: typeof tx) => Promise<unknown>) => work(tx)),
    };
    const service = new FinanceService(prisma as never, { getPilotChurch: async () => scope } as never, {} as never);
    return { service, tx, audits };
  }

  const input = {
    requestId: "d47d43a5-5775-4c53-8ef3-113696ebc820",
    entryDate: "2026-11-12",
    description: "Conta de energia",
    expenseAccountId: "energy",
    cashAccountId: "bank",
    amountCents: 27550,
    costCenterId: "cc-1",
  };

  it("avisa duplicidade possível e grava a justificativa na mesma transação", async () => {
    const similar = { ...saved, id: "expense-antiga", description: " conta  de energía " };
    const { service, tx, audits } = harness([similar]);
    await expect(service.createExpense(treasurer, input)).rejects.toMatchObject({
      response: {
        code: "LEDGER_POSSIBLE_DUPLICATE",
        existing: { id: "expense-antiga", status: "PENDING_APPROVAL", amountCents: 27550, entryDate: "2026-11-12" },
      },
    });
    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();

    const created = await service.createExpense(treasurer, {
      ...input,
      duplicateExistingId: "expense-antiga",
      duplicateJustification: "Segunda parcela autorizada pela ata.",
    });
    expect(created.id).toBe(saved.id);
    expect(audits).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: "ledger.entry.duplicate_justified",
        metadata: expect.objectContaining({ duplicateExistingId: "expense-antiga" }),
      }),
    ]));
    expect(tx.ledgerEntry.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ churchId: scope.churchId, costCenterId: "cc-1" }),
    }));
  });

  it("não aceita justificativa para documento confirmado nem para outro candidato", async () => {
    const documented = { ...saved, id: "expense-doc", externalDocumentId: "NF-10" };
    const other = { ...saved, id: "expense-outra" };
    const { service, tx } = harness([documented, other]);
    await expect(service.createExpense(treasurer, {
      ...input,
      requestId: "11111111-1111-4111-8111-111111111111",
      externalDocumentId: "NF-10",
      duplicateExistingId: "expense-doc",
      duplicateJustification: "Quero lançar o mesmo documento de novo.",
    })).rejects.toMatchObject({ response: { code: "LEDGER_DUPLICATE_CONFIRMED", existing: { id: "expense-doc" } } });
    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();

    const { service: review, tx: reviewTx } = harness([saved, other]);
    await expect(review.createExpense(treasurer, {
      ...input,
      requestId: "22222222-2222-4222-8222-222222222222",
      duplicateExistingId: saved.id,
      duplicateJustification: "Revisei somente o primeiro lançamento.",
    })).rejects.toMatchObject({ response: { code: "LEDGER_POSSIBLE_DUPLICATE", existing: { id: "expense-outra" } } });
    expect(reviewTx.ledgerEntry.create).not.toHaveBeenCalled();
  });

  it("repete o mesmo requestId sem duplicar e recusa payload diferente", async () => {
    const { service, tx } = harness();
    tx.ledgerEntry.create.mockRejectedValueOnce({ code: "P2002" });
    await expect(service.createExpense(treasurer, input)).resolves.toMatchObject({ id: saved.id });
    tx.ledgerEntry.create.mockRejectedValueOnce({ code: "P2002" });
    await expect(service.createExpense(treasurer, {
      ...input, amountCents: 30000, duplicateExistingId: saved.id, duplicateJustification: "Não deve sobrescrever o envio.",
    })).rejects.toMatchObject({ response: { code: "LEDGER_DUPLICATE_CONFIRMED", existing: { id: saved.id } } });
  });

  it("não consulta lançamento de outra congregação", async () => {
    const { service, tx } = harness([{ ...saved, id: "fora", churchId: "outra" }]);
    tx.ledgerEntry.findMany.mockResolvedValue([]);
    await expect(service.createExpense(treasurer, {
      ...input, requestId: "33333333-3333-4333-8333-333333333333", description: "Oferta distinta",
    })).resolves.toMatchObject({ status: "PENDING_APPROVAL" });
    expect(tx.ledgerEntry.findMany.mock.calls[0][0].where.churchId).toBe(scope.churchId);
  });
});
