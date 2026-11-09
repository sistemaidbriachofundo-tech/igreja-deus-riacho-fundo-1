import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import type { AuthUser } from "../auth/types/auth-user";
import { TreasuryService } from "./treasury.service";

const pilot = {
  organizationId: "org1",
  churchId: "church-rf1",
  organizationSlug: "igreja-de-deus",
  churchSlug: "riacho-fundo-1",
  churchName: "Riacho Fundo I (demo)",
};

function user(role: string, churchId = "church-rf1"): AuthUser {
  return {
    userId: `u-${role.toLowerCase()}`,
    personId: `p-${role.toLowerCase()}`,
    email: `${role.toLowerCase()}@example.test`,
    grants: [{ roleCode: role as AuthUser["grants"][number]["roleCode"], organizationId: "org1", churchId }],
  };
}

const treasurer = user("TESOURARIA");

const cash = { id: "acc-caixa", code: "1.1.01", type: "ASSET", active: true };
const revenue = { id: "acc-oferta", code: "4.1.01", type: "REVENUE", active: true };
const receivable = { id: "acc-ar", code: "1.2.01", type: "ASSET", active: true };
const expense = { id: "acc-desp", code: "5.1.01", type: "EXPENSE", active: true };
const payable = { id: "acc-ap", code: "2.1.01", type: "LIABILITY", active: true };

function row(
  id: string,
  status: string,
  lines: Array<{ side: "DEBIT" | "CREDIT"; amountCents: number; code: string; type: string }>,
) {
  return {
    id,
    status,
    costCenterId: "cc-culto",
    lines: lines.map((line, index) => ({
      side: line.side,
      amountCents: line.amountCents,
      account: { id: `line-${index}`, code: line.code, type: line.type },
    })),
  };
}

describe("TreasuryService", () => {
  const pilotService = { getPilotChurch: jest.fn().mockResolvedValue(pilot) };

  function build(prisma: object, finance: object = {}) {
    return new TreasuryService(prisma as never, pilotService as never, finance as never);
  }

  it.each([
    "SECRETARIA",
    "PASTOR",
    "PLATFORM_ADMIN",
    "LIDER_MINISTERIO",
    "MEMBRO",
  ])("nega %s na posição e no lançamento", async (role) => {
    const service = build({});
    const actor = user(role);
    await expect(service.position(actor)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.postCashReceipt(actor, {
        idempotencyKey: "hml-key-01",
        entryDate: "2026-11-09",
        description: "Oferta sintética",
        cashAccountId: cash.id,
        revenueAccountId: revenue.id,
        grossCents: 1000,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("nega tesouraria de outra congregação", async () => {
    const service = build({});
    await expect(service.position(user("TESOURARIA", "church-other"))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("separa os quatro saldos e deixa pendência fora da posição", async () => {
    const service = build({
      ledgerEntry: {
        findMany: jest.fn().mockResolvedValue([
          row("e1", "APPROVED", [
            { side: "DEBIT", amountCents: 10000, code: "1.1.01", type: "ASSET" },
            { side: "CREDIT", amountCents: 10000, code: "4.1.01", type: "REVENUE" },
          ]),
          row("e2", "APPROVED", [
            { side: "DEBIT", amountCents: 8000, code: "1.2.01", type: "ASSET" },
            { side: "CREDIT", amountCents: 8000, code: "4.1.01", type: "REVENUE" },
          ]),
          row("e3", "APPROVED", [
            { side: "DEBIT", amountCents: 5000, code: "5.1.01", type: "EXPENSE" },
            { side: "CREDIT", amountCents: 5000, code: "2.1.01", type: "LIABILITY" },
          ]),
          row("e4", "PENDING_APPROVAL", [
            { side: "DEBIT", amountCents: 25000, code: "1.1.01", type: "ASSET" },
            { side: "CREDIT", amountCents: 25000, code: "4.1.01", type: "REVENUE" },
          ]),
        ]),
      },
    });

    const result = await service.position(treasurer);
    expect(result.liveBankApis).toBe(false);
    expect(result.blocked.pix).toBe("BLOCKED");
    expect(result.blocked.rbacPr101Integrated).toBe(false);
    expect(result.position.receivedRevenueCents).toBe(10000);
    expect(result.position.receivableOpenCents).toBe(8000);
    expect(result.position.settledCashCents).toBe(10000);
    expect(result.position.committedExpenseCents).toBe(5000);
    expect(result.position.availableCents).toBe(5000);
    expect(result.position.excluded.PENDING_APPROVAL).toBe(1);
  });

  it("grava o rascunho uma vez e replay não cria outro lançamento", async () => {
    const createEntry = jest.fn().mockResolvedValue({ id: "e1", status: "DRAFT" });
    const getEntry = jest.fn().mockResolvedValue({ id: "e1", status: "APPROVED" });
    const auditCreate = jest.fn().mockResolvedValue({ id: "audit-1" });
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        metadata: { idempotencyKey: "hml-key-01", entryId: "e1", kind: "CASH_RECEIPT" },
      });
    const service = build(
      {
        ledgerAccount: { findMany: jest.fn().mockResolvedValue([cash, revenue]) },
        auditLog: { findFirst, create: auditCreate },
      },
      { createEntry, getEntry },
    );
    const input = {
      idempotencyKey: "hml-key-01",
      entryDate: "2026-11-09",
      description: "Oferta sintética de culto",
      cashAccountId: cash.id,
      revenueAccountId: revenue.id,
      grossCents: 10000,
    };

    const first = await service.postCashReceipt(treasurer, input);
    const second = await service.postCashReceipt(treasurer, input);

    expect(first.idempotentReplay).toBe(false);
    expect(first.countsTowardPosition).toBe(false);
    expect(first.reason).toBe("DRAFT_AWAITING_DUAL_APPROVAL");
    expect(second.idempotentReplay).toBe(true);
    expect(second.countsTowardPosition).toBe(true);
    expect(second.entry.id).toBe("e1");
    expect(createEntry).toHaveBeenCalledTimes(1);
    expect(auditCreate).toHaveBeenCalledTimes(1);
    expect(getEntry).toHaveBeenCalledWith(treasurer, "e1");
  });

  it("não grava quando a conta de caixa não é 1.1", async () => {
    const createEntry = jest.fn();
    const otherAsset = { id: "acc-outro", code: "1.3.01", type: "ASSET", active: true };
    const service = build(
      {
        ledgerAccount: { findMany: jest.fn().mockResolvedValue([otherAsset, revenue]) },
        auditLog: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
      },
      { createEntry },
    );
    await expect(
      service.postCashReceipt(treasurer, {
        idempotencyKey: "hml-key-02",
        entryDate: "2026-11-09",
        description: "Oferta sintética de culto",
        cashAccountId: otherAsset.id,
        revenueAccountId: revenue.id,
        grossCents: 1000,
      }),
    ).rejects.toMatchObject({ response: { code: "ACCOUNT_ROLE_MISMATCH" } });
    expect(createEntry).not.toHaveBeenCalled();
  });

  it("recusa reutilizar a chave em outro tipo e chave órfã", async () => {
    const orphan = build(
      {
        auditLog: {
          findFirst: jest.fn().mockResolvedValue({
            metadata: { entryId: "missing", kind: "CASH_RECEIPT" },
          }),
        },
      },
      { getEntry: jest.fn().mockRejectedValue(new NotFoundException()) },
    );
    await expect(
      orphan.postCashReceipt(treasurer, {
        idempotencyKey: "hml-key-03",
        entryDate: "2026-11-09",
        description: "Oferta sintética de culto",
        cashAccountId: cash.id,
        revenueAccountId: revenue.id,
        grossCents: 1000,
      }),
    ).rejects.toMatchObject({ response: { code: "IDEMPOTENCY_ORPHAN" } });

    const mismatch = build({
      auditLog: {
        findFirst: jest.fn().mockResolvedValue({
          metadata: { entryId: "e9", kind: "RECEIVABLE" },
        }),
      },
    });
    await expect(
      mismatch.postCommitment(treasurer, {
        idempotencyKey: "hml-key-04",
        entryDate: "2026-11-09",
        description: "Conta de luz sintética",
        expenseAccountId: expense.id,
        payableAccountId: payable.id,
        amountCents: 5000,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("liquidação não chama receita e recebível não usa caixa", async () => {
    const createEntry = jest.fn().mockResolvedValue({ id: "e-ar", status: "DRAFT" });
    const service = build(
      {
        ledgerAccount: {
          findMany: jest.fn().mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) => {
            const all = [cash, revenue, receivable, expense, payable];
            return all.filter((account) => where.id.in.includes(account.id));
          }),
        },
        auditLog: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
      },
      { createEntry },
    );

    await service.postReceivable(treasurer, {
      idempotencyKey: "hml-key-05",
      entryDate: "2026-11-09",
      description: "Dízimo a receber sintético",
      receivableAccountId: receivable.id,
      revenueAccountId: revenue.id,
      grossCents: 8000,
    });
    await service.postSettlement(treasurer, {
      idempotencyKey: "hml-key-06",
      entryDate: "2026-11-09",
      description: "Pagamento sintético do compromisso",
      payableAccountId: payable.id,
      cashAccountId: cash.id,
      amountCents: 5000,
    });

    const receivableLines = createEntry.mock.calls[0][1].lines as Array<{ memo: string }>;
    const settlementLines = createEntry.mock.calls[1][1].lines as Array<{ memo: string }>;
    expect(receivableLines.map((item) => item.memo)).toEqual(["treasury:receivable", "treasury:gross"]);
    expect(settlementLines.map((item) => item.memo)).not.toContain("treasury:gross");
    expect(settlementLines.map((item) => item.memo)).not.toContain("treasury:expense");
  });

  it("não registra idempotência se o ledger recusar o lançamento", async () => {
    const auditCreate = jest.fn();
    const service = build(
      {
        ledgerAccount: { findMany: jest.fn().mockResolvedValue([cash, revenue]) },
        auditLog: { findFirst: jest.fn().mockResolvedValue(null), create: auditCreate },
      },
      { createEntry: jest.fn().mockRejectedValue(new BadRequestException("periodo fechado")) },
    );
    await expect(
      service.postCashReceipt(treasurer, {
        idempotencyKey: "hml-key-07",
        entryDate: "2026-11-09",
        description: "Oferta sintética de culto",
        cashAccountId: cash.id,
        revenueAccountId: revenue.id,
        grossCents: 1000,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(auditCreate).not.toHaveBeenCalled();
  });
});
