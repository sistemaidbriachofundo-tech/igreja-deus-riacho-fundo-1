import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { FinanceService } from "./finance.service";
import type { AuthUser } from "../auth/types/auth-user";

describe("FinanceService", () => {
  const pilot = {
    organizationId: "org1",
    churchId: "church-rf1",
    organizationSlug: "igreja-de-deus",
    churchSlug: "riacho-fundo-1",
    churchName: "Riacho Fundo I (demo)",
  };

  const treasurer: AuthUser = {
    userId: "u-tesoura",
    personId: "p-tesoura",
    email: "tesouraria.demo@example.test",
    grants: [
      {
        roleCode: "TESOURARIA",
        organizationId: "org1",
        churchId: "church-rf1",
      },
    ],
  };

  const treasurer2: AuthUser = {
    userId: "u-tesoura-2",
    personId: "p-tesoura-2",
    email: "tesouraria2.demo@example.test",
    grants: [
      {
        roleCode: "TESOURARIA",
        organizationId: "org1",
        churchId: "church-rf1",
      },
    ],
  };

  const secretaria: AuthUser = {
    userId: "u-sec",
    personId: "p-sec",
    email: "ana.demo@example.test",
    grants: [
      {
        roleCode: "SECRETARIA",
        organizationId: "org1",
        churchId: "church-rf1",
      },
    ],
  };

  const now = new Date("2026-11-06T12:00:00Z");

  const accountRow = {
    id: "acc-caixa",
    organizationId: pilot.organizationId,
    churchId: pilot.churchId,
    code: "1.1.01",
    name: "Caixa",
    type: "ASSET",
    parentId: null as string | null,
    costCenter: null as string | null,
    active: true,
    createdAt: now,
    updatedAt: now,
  };

  const revenueRow = {
    ...accountRow,
    id: "acc-ofertas",
    code: "4.1.01",
    name: "Ofertas",
    type: "REVENUE",
  };

  function withTx(tx: object) {
    return {
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    };
  }

  it("forbids SECRETARIA from listing accounts", async () => {
    const service = new FinanceService(
      {} as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(service.listAccounts(secretaria)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("lists chart of accounts for TESOURARIA", async () => {
    const service = new FinanceService(
      {
        ledgerAccount: {
          findMany: jest.fn().mockResolvedValue([accountRow]),
        },
      } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const result = await service.listAccounts(treasurer);
    expect(result.accounts).toHaveLength(1);
    expect(result.accounts[0].code).toBe("1.1.01");
  });

  it("creates ledger account with audit", async () => {
    const tx = {
      ledgerAccount: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(accountRow),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new FinanceService(
      withTx(tx) as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const dto = await service.createAccount(treasurer, {
      code: "1.1.01",
      name: "Caixa",
      type: "ASSET",
    });
    expect(dto.id).toBe("acc-caixa");
    expect(tx.auditLog.create).toHaveBeenCalled();
  });

  it("rejects duplicate account code", async () => {
    const tx = {
      ledgerAccount: {
        findUnique: jest.fn().mockResolvedValue(accountRow),
      },
      auditLog: { create: jest.fn() },
    };
    const service = new FinanceService(
      withTx(tx) as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      service.createAccount(treasurer, {
        code: "1.1.01",
        name: "Caixa",
        type: "ASSET",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("gets and patches account", async () => {
    const tx = {
      ledgerAccount: {
        update: jest.fn().mockResolvedValue({ ...accountRow, active: false }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new FinanceService(
      {
        ...withTx(tx),
        ledgerAccount: {
          findFirst: jest.fn().mockResolvedValue(accountRow),
        },
      } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const got = await service.getAccount(treasurer, "acc-caixa");
    expect(got.code).toBe("1.1.01");
    const patched = await service.patchAccount(treasurer, "acc-caixa", {
      active: false,
    });
    expect(patched.active).toBe(false);
  });

  it("rejects unbalanced entry", async () => {
    const service = new FinanceService(
      {
        ledgerAccount: { findMany: jest.fn() },
      } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      service.createEntry(treasurer, {
        entryDate: "2026-11-01",
        description: "Oferta",
        lines: [
          { accountId: "acc-caixa", side: "DEBIT", amountCents: 100 },
          { accountId: "acc-ofertas", side: "CREDIT", amountCents: 50 },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("creates balanced draft entry", async () => {
    const entry = {
      id: "le1",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      entryDate: new Date("2026-11-01"),
      description: "Oferta demo",
      status: "DRAFT",
      amountCents: 15000,
      createdByUserId: treasurer.userId,
      submittedAt: null,
      firstApprovedByUserId: null,
      firstApprovedAt: null,
      secondApprovedByUserId: null,
      secondApprovedAt: null,
      rejectedByUserId: null,
      rejectedAt: null,
      rejectionReason: null,
      reversalOfEntryId: null,
      importBatchId: null,
      reconciliationId: null,
      createdAt: now,
      updatedAt: now,
      lines: [
        {
          id: "ln1",
          accountId: "acc-caixa",
          side: "DEBIT",
          amountCents: 15000,
          memo: null,
        },
        {
          id: "ln2",
          accountId: "acc-ofertas",
          side: "CREDIT",
          amountCents: 15000,
          memo: null,
        },
      ],
    };
    const tx = {
      ledgerEntry: { create: jest.fn().mockResolvedValue(entry) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new FinanceService(
      {
        ...withTx(tx),
        ledgerAccount: {
          findMany: jest.fn().mockResolvedValue([accountRow, revenueRow]),
        },
      } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const dto = await service.createEntry(treasurer, {
      entryDate: "2026-11-01",
      description: "Oferta demo",
      lines: [
        { accountId: "acc-caixa", side: "DEBIT", amountCents: 15000 },
        { accountId: "acc-ofertas", side: "CREDIT", amountCents: 15000 },
      ],
    });
    expect(dto.status).toBe("DRAFT");
    expect(dto.amountCents).toBe(15000);
  });

  it("runs dual approval then reverse", async () => {
    const pending = {
      id: "le1",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      entryDate: new Date("2026-11-01"),
      description: "Oferta",
      status: "PENDING_APPROVAL",
      amountCents: 1000,
      createdByUserId: treasurer.userId,
      submittedAt: now,
      firstApprovedByUserId: null as string | null,
      firstApprovedAt: null as Date | null,
      secondApprovedByUserId: null as string | null,
      secondApprovedAt: null as Date | null,
      rejectedByUserId: null,
      rejectedAt: null,
      rejectionReason: null,
      reversalOfEntryId: null,
      importBatchId: null,
      reconciliationId: null,
      createdAt: now,
      updatedAt: now,
      lines: [
        {
          id: "ln1",
          accountId: "acc-caixa",
          side: "DEBIT",
          amountCents: 1000,
          memo: null,
        },
        {
          id: "ln2",
          accountId: "acc-ofertas",
          side: "CREDIT",
          amountCents: 1000,
          memo: null,
        },
      ],
      reversedBy: null as { id: string } | null,
    };

    const firstApproved = {
      ...pending,
      firstApprovedByUserId: treasurer2.userId,
      firstApprovedAt: now,
    };
    const fullyApproved = {
      ...firstApproved,
      status: "APPROVED",
      secondApprovedByUserId: "u-tesoura-3",
      secondApprovedAt: now,
    };
    const reversal = {
      ...fullyApproved,
      id: "le-rev",
      status: "APPROVED",
      reversalOfEntryId: "le1",
      description: "Estorno de le1: Oferta",
      lines: [
        {
          id: "ln3",
          accountId: "acc-caixa",
          side: "CREDIT",
          amountCents: 1000,
          memo: "estorno:ln1",
        },
        {
          id: "ln4",
          accountId: "acc-ofertas",
          side: "DEBIT",
          amountCents: 1000,
          memo: "estorno:ln2",
        },
      ],
    };

    const findFirst = jest
      .fn()
      .mockResolvedValueOnce(pending) // creator blocked
      .mockResolvedValueOnce(pending) // first approver
      .mockResolvedValueOnce(firstApproved) // second approver
      .mockResolvedValueOnce(fullyApproved); // reverse

    const update = jest
      .fn()
      .mockResolvedValueOnce(firstApproved)
      .mockResolvedValueOnce(fullyApproved)
      .mockResolvedValueOnce({ ...fullyApproved, status: "REVERSED" });

    const tx = {
      ledgerEntry: {
        update,
        create: jest.fn().mockResolvedValue(reversal),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };

    const service = new FinanceService(
      {
        ...withTx(tx),
        ledgerEntry: { findFirst },
      } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    await expect(
      service.approveEntry(treasurer, "le1"),
    ).rejects.toBeInstanceOf(ConflictException);

    const first = await service.approveEntry(treasurer2, "le1");
    expect(first.firstApprovedByUserId).toBe(treasurer2.userId);

    const third: AuthUser = {
      ...treasurer2,
      userId: "u-tesoura-3",
      personId: "p-tesoura-3",
    };
    const second = await service.approveEntry(third, "le1");
    expect(second.status).toBe("APPROVED");

    const rev = await service.reverseEntry(treasurer, "le1");
    expect(rev.reversalOfEntryId).toBe("le1");
  });

  it("submits and rejects entry", async () => {
    const draft = {
      id: "le1",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      entryDate: new Date("2026-11-01"),
      description: "x",
      status: "DRAFT",
      amountCents: 100,
      createdByUserId: treasurer.userId,
      submittedAt: null,
      firstApprovedByUserId: null,
      firstApprovedAt: null,
      secondApprovedByUserId: null,
      secondApprovedAt: null,
      rejectedByUserId: null,
      rejectedAt: null,
      rejectionReason: null,
      reversalOfEntryId: null,
      importBatchId: null,
      reconciliationId: null,
      createdAt: now,
      updatedAt: now,
      lines: [],
      reversedBy: null,
    };
    const pending = { ...draft, status: "PENDING_APPROVAL", submittedAt: now };
    const rejected = {
      ...pending,
      status: "REJECTED",
      rejectedByUserId: treasurer2.userId,
      rejectedAt: now,
      rejectionReason: "doc incompleto",
    };

    const findFirst = jest
      .fn()
      .mockResolvedValueOnce(draft)
      .mockResolvedValueOnce(pending);
    const tx = {
      ledgerEntry: {
        update: jest
          .fn()
          .mockResolvedValueOnce(pending)
          .mockResolvedValueOnce(rejected),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new FinanceService(
      {
        ...withTx(tx),
        ledgerEntry: { findFirst },
      } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const submitted = await service.submitEntry(treasurer, "le1");
    expect(submitted.status).toBe("PENDING_APPROVAL");
    const rej = await service.rejectEntry(
      treasurer2,
      "le1",
      "doc incompleto",
    );
    expect(rej.status).toBe("REJECTED");
  });

  it("lists entries and returns 404 for missing", async () => {
    const service = new FinanceService(
      {
        ledgerEntry: {
          findMany: jest.fn().mockResolvedValue([]),
          findFirst: jest.fn().mockResolvedValue(null),
        },
      } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const listed = await service.listEntries(treasurer, "DRAFT");
    expect(listed.entries).toEqual([]);
    await expect(service.getEntry(treasurer, "missing")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("creates CSV import stub with lines and OFX metadata stub", async () => {
    const csvBatch = {
      id: "batch1",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      format: "CSV",
      status: "PARSED_STUB",
      filename: "extrato-demo.csv",
      stubNote: "CSV sintético",
      lineCount: 1,
      createdByUserId: treasurer.userId,
      createdAt: now,
      updatedAt: now,
      lines: [
        {
          id: "bl1",
          postedAt: new Date("2026-11-01"),
          amountCents: 25000,
          description: "Oferta demo",
          externalRef: "ref-1",
          matchStatus: "UNMATCHED",
          matchedEntryId: null,
        },
      ],
    };
    const ofxBatch = {
      ...csvBatch,
      id: "batch2",
      format: "OFX",
      lineCount: 0,
      lines: [],
      stubNote: "OFX parser não implementado",
    };

    const create = jest
      .fn()
      .mockResolvedValueOnce(csvBatch)
      .mockResolvedValueOnce(ofxBatch);
    const tx = {
      bankImportBatch: { create },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new FinanceService(
      {
        ...withTx(tx),
        bankImportBatch: {
          findMany: jest.fn().mockResolvedValue([csvBatch]),
          findFirst: jest.fn().mockResolvedValue(csvBatch),
        },
      } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    const csv = await service.createImport(treasurer, {
      format: "CSV",
      filename: "extrato-demo.csv",
      textContent: "2026-11-01,25000,Oferta demo,ref-1",
    });
    expect(csv.lineCount).toBe(1);

    const ofx = await service.createImport(treasurer, {
      format: "OFX",
      filename: "extrato.ofx",
    });
    expect(ofx.format).toBe("OFX");
    expect(ofx.lines).toHaveLength(0);

    const listed = await service.listImports(treasurer);
    expect(listed.batches).toHaveLength(1);
    const got = await service.getImport(treasurer, "batch1");
    expect(got.id).toBe("batch1");
  });

  it("fails CSV import when content has no valid rows", async () => {
    const failed = {
      id: "batch-fail",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      format: "CSV",
      status: "FAILED",
      filename: "bad.csv",
      stubNote: "CSV sem linhas válidas",
      lineCount: 0,
      createdByUserId: treasurer.userId,
      createdAt: now,
      updatedAt: now,
      lines: [],
    };
    const tx = {
      bankImportBatch: { create: jest.fn().mockResolvedValue(failed) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new FinanceService(
      withTx(tx) as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const result = await service.createImport(treasurer, {
      format: "CSV",
      filename: "bad.csv",
      textContent: "not,a,valid",
    });
    expect(result.status).toBe("FAILED");
  });

  it("runs reconciliation dual-approval and close", async () => {
    const open = {
      id: "rec1",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      title: "Nov/2026",
      periodStart: new Date("2026-11-01"),
      periodEnd: new Date("2026-11-30"),
      status: "OPEN",
      notes: null as string | null,
      createdByUserId: treasurer.userId,
      firstApprovedByUserId: null as string | null,
      firstApprovedAt: null as Date | null,
      secondApprovedByUserId: null as string | null,
      secondApprovedAt: null as Date | null,
      closedAt: null as Date | null,
      createdAt: now,
      updatedAt: now,
    };
    const pending = { ...open, status: "PENDING_APPROVAL" };
    const first = {
      ...pending,
      firstApprovedByUserId: treasurer2.userId,
      firstApprovedAt: now,
    };
    const approved = {
      ...first,
      status: "APPROVED",
      secondApprovedByUserId: "u-tesoura-3",
      secondApprovedAt: now,
    };
    const closed = { ...approved, status: "CLOSED", closedAt: now };

    const findFirst = jest
      .fn()
      .mockResolvedValueOnce(open)
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(approved);

    const update = jest
      .fn()
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(approved)
      .mockResolvedValueOnce(closed);

    const tx = {
      reconciliation: {
        create: jest.fn().mockResolvedValue(open),
        update,
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };

    const service = new FinanceService(
      {
        ...withTx(tx),
        reconciliation: {
          findMany: jest.fn().mockResolvedValue([open]),
          findFirst,
        },
      } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    const created = await service.createReconciliation(treasurer, {
      title: "Nov/2026",
      periodStart: "2026-11-01",
      periodEnd: "2026-11-30",
    });
    expect(created.status).toBe("OPEN");

    const listed = await service.listReconciliations(treasurer);
    expect(listed.reconciliations).toHaveLength(1);

    const submitted = await service.submitReconciliation(treasurer, "rec1");
    expect(submitted.status).toBe("PENDING_APPROVAL");

    await service.approveReconciliation(treasurer2, "rec1");
    const third: AuthUser = {
      ...treasurer,
      userId: "u-tesoura-3",
    };
    const appr = await service.approveReconciliation(third, "rec1");
    expect(appr.status).toBe("APPROVED");

    const closedDto = await service.closeReconciliation(treasurer, "rec1");
    expect(closedDto.status).toBe("CLOSED");
  });

  it("validates reconciliation period and missing resources", async () => {
    const service = new FinanceService(
      {
        reconciliation: { findFirst: jest.fn().mockResolvedValue(null) },
        bankImportBatch: { findFirst: jest.fn().mockResolvedValue(null) },
        ledgerAccount: { findFirst: jest.fn().mockResolvedValue(null) },
      } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      service.createReconciliation(treasurer, {
        title: "x",
        periodStart: "2026-11-30",
        periodEnd: "2026-11-01",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.getReconciliation(treasurer, "missing"),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.getImport(treasurer, "missing")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      service.getAccount(treasurer, "missing"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("matches and unmatches bank statement line to ledger entry", async () => {
    const line = {
      id: "bl1",
      batchId: "batch1",
      postedAt: new Date("2026-11-01"),
      amountCents: 25000,
      description: "Oferta demo",
      externalRef: "ref-1",
      matchStatus: "UNMATCHED",
      matchedEntryId: null as string | null,
      createdAt: now,
      batch: {
        id: "batch1",
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      },
    };
    const matched = {
      ...line,
      matchStatus: "MATCHED",
      matchedEntryId: "entry1",
    };
    const unmatched = {
      ...line,
      matchStatus: "UNMATCHED",
      matchedEntryId: null,
    };
    const entry = {
      id: "entry1",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      entryDate: new Date("2026-11-01"),
      description: "Oferta",
      status: "APPROVED",
      amountCents: 25000,
      createdByUserId: treasurer.userId,
      submittedAt: now,
      firstApprovedByUserId: treasurer2.userId,
      firstApprovedAt: now,
      secondApprovedByUserId: "u-tesoura-3",
      secondApprovedAt: now,
      rejectedByUserId: null,
      rejectedAt: null,
      rejectionReason: null,
      reversalOfEntryId: null,
      importBatchId: null,
      reconciliationId: null as string | null,
      createdAt: now,
      updatedAt: now,
      lines: [],
      reversedBy: null,
    };
    const openRec = {
      id: "rec1",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      title: "Nov",
      periodStart: new Date("2026-11-01"),
      periodEnd: new Date("2026-11-30"),
      status: "OPEN",
      notes: null,
      createdByUserId: treasurer.userId,
      firstApprovedByUserId: null,
      firstApprovedAt: null,
      secondApprovedByUserId: null,
      secondApprovedAt: null,
      closedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    const matchTx = {
      bankStatementLine: {
        update: jest.fn().mockResolvedValue(matched),
      },
      ledgerEntry: {
        update: jest.fn().mockResolvedValue({ ...entry, reconciliationId: "rec1" }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const unmatchTx = {
      bankStatementLine: {
        update: jest.fn().mockResolvedValue(unmatched),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };

    const service = new FinanceService(
      {
        bankStatementLine: {
          findFirst: jest
            .fn()
            .mockResolvedValueOnce(line)
            .mockResolvedValueOnce(null) // no other match
            .mockResolvedValueOnce(matched),
        },
        ledgerEntry: {
          findFirst: jest
            .fn()
            .mockResolvedValueOnce(entry)
            .mockResolvedValueOnce({ reconciliationId: "rec1" }),
        },
        reconciliation: {
          findFirst: jest
            .fn()
            .mockResolvedValueOnce(openRec)
            .mockResolvedValueOnce({ status: "OPEN" }),
        },
        $transaction: jest
          .fn()
          .mockImplementationOnce(async (fn: (t: typeof matchTx) => unknown) =>
            fn(matchTx),
          )
          .mockImplementationOnce(async (fn: (t: typeof unmatchTx) => unknown) =>
            fn(unmatchTx),
          ),
      } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    const m = await service.matchBankLine(treasurer, "bl1", {
      entryId: "entry1",
      reconciliationId: "rec1",
    });
    expect(m.matchStatus).toBe("MATCHED");
    expect(m.matchedEntryId).toBe("entry1");
    expect(matchTx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "ledger.bank_line.match" }),
      }),
    );

    const u = await service.unmatchBankLine(treasurer, "bl1");
    expect(u.matchStatus).toBe("UNMATCHED");
    expect(u.matchedEntryId).toBeNull();
  });

  it("rejects match on amount mismatch and already matched line", async () => {
    const line = {
      id: "bl1",
      batchId: "batch1",
      postedAt: now,
      amountCents: 100,
      description: "x",
      externalRef: null,
      matchStatus: "UNMATCHED",
      matchedEntryId: null,
      createdAt: now,
      batch: {
        id: "batch1",
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      },
    };
    const entry = {
      id: "entry1",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      entryDate: now,
      description: "y",
      status: "DRAFT",
      amountCents: 999,
      createdByUserId: treasurer.userId,
      submittedAt: null,
      firstApprovedByUserId: null,
      firstApprovedAt: null,
      secondApprovedByUserId: null,
      secondApprovedAt: null,
      rejectedByUserId: null,
      rejectedAt: null,
      rejectionReason: null,
      reversalOfEntryId: null,
      importBatchId: null,
      reconciliationId: null,
      createdAt: now,
      updatedAt: now,
      lines: [],
      reversedBy: null,
    };
    const already = {
      ...line,
      matchStatus: "MATCHED",
      matchedEntryId: "other",
    };

    const service = new FinanceService(
      {
        bankStatementLine: {
          findFirst: jest
            .fn()
            .mockResolvedValueOnce(line)
            .mockResolvedValueOnce(already),
        },
        ledgerEntry: {
          findFirst: jest.fn().mockResolvedValue(entry),
        },
      } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    await expect(
      service.matchBankLine(treasurer, "bl1", { entryId: "entry1" }),
    ).rejects.toBeInstanceOf(ConflictException);

    await expect(
      service.matchBankLine(treasurer, "bl1", { entryId: "entry1" }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("404s unknown bank line on match", async () => {
    const service = new FinanceService(
      {
        bankStatementLine: { findFirst: jest.fn().mockResolvedValue(null) },
      } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      service.matchBankLine(treasurer, "missing", { entryId: "e1" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
