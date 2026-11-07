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
    costCenterId: null as string | null,
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

  const mockStorage = {
    buildLedgerAttachmentKey: jest.fn().mockReturnValue("ledger/org1/church-rf1/e1/a.pdf"),
    put: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(Buffer.from("%PDF")),
    remove: jest.fn().mockResolvedValue(undefined),
    contentSha256: jest.fn().mockReturnValue("a".repeat(64)),
  };

  it("forbids SECRETARIA from listing accounts", async () => {
    const service = new FinanceService(
      {} as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
      mockStorage as never,
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
      mockStorage as never,
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
      mockStorage as never,
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
      mockStorage as never,
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
      mockStorage as never,
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
      mockStorage as never,
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
        accountingPeriod: { findFirst: jest.fn().mockResolvedValue(null) },
        ledgerAccount: {
          findMany: jest.fn().mockResolvedValue([accountRow, revenueRow]),
        },
      } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
      mockStorage as never,
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
      mockStorage as never,
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
      mockStorage as never,
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
      mockStorage as never,
    );
    const listed = await service.listEntries(treasurer, "DRAFT");
    expect(listed.entries).toEqual([]);
    await expect(service.getEntry(treasurer, "missing")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("creates CSV/OFX parsed imports and PDF_META as META_ONLY", async () => {
    const csvBatch = {
      id: "batch1",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      format: "CSV",
      status: "PARSED",
      adapter: "FILE",
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
      status: "PARSED",
      lineCount: 1,
      lines: [
        {
          id: "bl-ofx",
          postedAt: new Date("2026-11-02"),
          amountCents: 25000,
          description: "TED OFERTA DEMO",
          externalRef: "SYN-OFX-001",
          matchStatus: "UNMATCHED",
          matchedEntryId: null,
        },
      ],
      stubNote: "OFX parseado",
    };
    const pdfBatch = {
      ...csvBatch,
      id: "batch3",
      format: "PDF_META",
      status: "META_ONLY",
      lineCount: 0,
      lines: [],
      stubNote: "PDF_META: somente metadados",
    };

    const create = jest
      .fn()
      .mockResolvedValueOnce(csvBatch)
      .mockResolvedValueOnce(ofxBatch)
      .mockResolvedValueOnce(pdfBatch);
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
      mockStorage as never,
    );

    const csv = await service.createImport(treasurer, {
      format: "CSV",
      filename: "extrato-demo.csv",
      textContent: "2026-11-01,25000,Oferta demo,ref-1",
    });
    expect(csv.lineCount).toBe(1);
    expect(csv.status).toBe("PARSED");

    const ofxPayload = `<OFX><STMTTRN><DTPOSTED>20261102<TRNAMT>250.00<FITID>SYN-OFX-001<NAME>TED OFERTA DEMO</STMTTRN></OFX>`;
    const ofx = await service.createImport(treasurer, {
      format: "OFX",
      filename: "extrato.ofx",
      textContent: ofxPayload,
      adapter: "MOCK",
    });
    expect(ofx.format).toBe("OFX");
    expect(ofx.status).toBe("PARSED");
    expect(ofx.lineCount).toBe(1);

    const pdf = await service.createImport(treasurer, {
      format: "PDF_META",
      filename: "extrato.pdf",
    });
    expect(pdf.status).toBe("META_ONLY");
    expect(pdf.lines).toHaveLength(0);

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
      mockStorage as never,
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
      mockStorage as never,
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
      mockStorage as never,
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
      mockStorage as never,
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
      mockStorage as never,
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
      mockStorage as never,
    );
    await expect(
      service.matchBankLine(treasurer, "missing", { entryId: "e1" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("creates fund/cost center and budget with period close gate", async () => {
    const fundRow = {
      id: "fund1",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      code: "MISSOES",
      name: "Missões",
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    const ccRow = { ...fundRow, id: "cc1", code: "ADM", name: "Administrativo" };
    const budgetRow = {
      id: "bud1",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      year: 2026,
      title: "Orçamento 2026",
      status: "DRAFT",
      notes: null,
      createdByUserId: treasurer.userId,
      createdAt: now,
      updatedAt: now,
      lines: [],
    };
    const periodRow = {
      id: "per1",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      year: 2026,
      month: 10,
      status: "OPEN",
      closedAt: null,
      closedByUserId: null,
      notes: null,
      createdAt: now,
      updatedAt: now,
    };

    const fundTx = {
      fund: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(fundRow),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const fundService = new FinanceService(
      { ...withTx(fundTx) } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
      mockStorage as never,
    );
    await expect(
      fundService.createFund(treasurer, { code: "MISSOES", name: "Missões" }),
    ).resolves.toMatchObject({ code: "MISSOES" });

    const ccTx = {
      costCenter: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(ccRow),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const ccService = new FinanceService(
      { ...withTx(ccTx) } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
      mockStorage as never,
    );
    await expect(
      ccService.createCostCenter(treasurer, { code: "ADM", name: "Administrativo" }),
    ).resolves.toMatchObject({ code: "ADM" });

    const budTx = {
      budget: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(budgetRow),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const budService = new FinanceService(
      { ...withTx(budTx) } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
      mockStorage as never,
    );
    await expect(
      budService.createBudget(treasurer, { year: 2026, title: "Orçamento 2026" }),
    ).resolves.toMatchObject({ year: 2026 });

    const perTx = {
      accountingPeriod: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(periodRow),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const perService = new FinanceService(
      {
        ...withTx(perTx),
        accountingPeriod: {
          findFirst: jest
            .fn()
            .mockResolvedValueOnce(periodRow)
            .mockResolvedValueOnce({ ...periodRow, status: "CLOSED" }),
          update: jest.fn().mockResolvedValue({
            ...periodRow,
            status: "CLOSED",
            closedAt: now,
            closedByUserId: treasurer.userId,
          }),
        },
        auditLog: { create: jest.fn().mockResolvedValue({}) },
      } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
      mockStorage as never,
    );
    await expect(
      perService.openPeriod(treasurer, { year: 2026, month: 10 }),
    ).resolves.toMatchObject({ status: "OPEN" });
    await expect(perService.closePeriod(treasurer, "per1")).resolves.toMatchObject({
      status: "CLOSED",
    });

    const blocked = new FinanceService(
      {
        accountingPeriod: {
          findFirst: jest.fn().mockResolvedValue({ id: "per1", status: "CLOSED" }),
        },
      } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
      mockStorage as never,
    );
    await expect(
      blocked.createEntry(treasurer, {
        entryDate: "2026-10-15",
        description: "bloqueado",
        lines: [
          { accountId: "acc-caixa", side: "DEBIT", amountCents: 100 },
          { accountId: "acc-ofertas", side: "CREDIT", amountCents: 100 },
        ],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("uploads ledger attachment to private storage", async () => {
    const entry = {
      id: "e1",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      entryDate: new Date("2026-11-02"),
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
      fundId: null,
      costCenterId: null,
      competenceYear: 2026,
      competenceMonth: 11,
      createdAt: now,
      updatedAt: now,
      lines: [],
      reversedBy: null,
    };
    const att = {
      id: "att1",
      entryId: "e1",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      uploadedByUserId: treasurer.userId,
      displayName: "recibo.pdf",
      contentType: "application/pdf",
      byteSize: 4,
      storageKey: "ledger/org1/church-rf1/e1/a.pdf",
      createdAt: now,
    };
    const service = new FinanceService(
      {
        accountingPeriod: { findFirst: jest.fn().mockResolvedValue(null) },
        ledgerEntry: { findFirst: jest.fn().mockResolvedValue(entry) },
        ledgerEntryAttachment: {
          create: jest.fn().mockResolvedValue(att),
          findMany: jest.fn().mockResolvedValue([att]),
        },
        auditLog: { create: jest.fn().mockResolvedValue({}) },
      } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
      mockStorage as never,
    );
    const meta = await service.uploadAttachment(treasurer, "e1", {
      originalname: "recibo.pdf",
      mimetype: "application/pdf",
      buffer: Buffer.from("%PDF"),
      size: 4,
    });
    expect(meta.displayName).toBe("recibo.pdf");
    expect(mockStorage.put).toHaveBeenCalled();
    const listed = await service.listAttachments(treasurer, "e1");
    expect(listed.attachments).toHaveLength(1);
  });

  it("lists bank adapters without live APIs", () => {
    const service = new FinanceService(
      {} as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
      mockStorage as never,
    );
    const result = service.listBankAdapters();
    expect(result.liveBankApis).toBe(false);
    expect(result.adapters.length).toBeGreaterThanOrEqual(5);
  });


  it("covers RF-016/019 densify gaps for Sonar new coverage", async () => {
    const cc = {
      id: "cc1",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      code: "ADM",
      name: "Admin",
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    const fund = { ...cc, id: "fund1", code: "GERAL", name: "Geral" };
    const budgetOpen = {
      id: "bud1",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      year: 2026,
      title: "Orc",
      status: "DRAFT",
      notes: null as string | null,
      createdByUserId: treasurer.userId,
      createdAt: now,
      updatedAt: now,
      lines: [] as Array<{
        id: string;
        accountId: string;
        fundId: string | null;
        costCenterId: string | null;
        plannedCents: number;
        notes: string | null;
      }>,
    };
    const budgetClosed = { ...budgetOpen, status: "CLOSED" };
    const period = {
      id: "per1",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      year: 2026,
      month: 11,
      status: "OPEN",
      closedAt: null as Date | null,
      closedByUserId: null as string | null,
      notes: null as string | null,
      createdAt: now,
      updatedAt: now,
    };
    const entry = {
      id: "e1",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      entryDate: new Date("2026-11-02"),
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
      fundId: null,
      costCenterId: null,
      competenceYear: 2026,
      competenceMonth: 11,
      createdAt: now,
      updatedAt: now,
      lines: [
        { id: "l1", accountId: "acc-caixa", side: "DEBIT", amountCents: 100, memo: null },
        { id: "l2", accountId: "acc-ofertas", side: "CREDIT", amountCents: 100, memo: null },
      ],
      reversedBy: null,
    };
    const att = {
      id: "att1",
      entryId: "e1",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      uploadedByUserId: treasurer.userId,
      displayName: "recibo.pdf",
      contentType: "application/pdf",
      byteSize: 4,
      storageKey: "ledger/org1/church-rf1/e1/a.pdf",
      createdAt: now,
    };

    // createAccount + costCenterId
    const createAccTx = {
      ledgerAccount: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ ...accountRow, costCenterId: "cc1", costCenter: "ADM" }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const createAcc = new FinanceService(
      {
        ...withTx(createAccTx),
        costCenter: { findFirst: jest.fn().mockResolvedValue(cc) },
      } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
      mockStorage as never,
    );
    await expect(
      createAcc.createAccount(treasurer, {
        code: "1.1.09",
        name: "Caixa CC",
        type: "ASSET",
        costCenterId: "cc1",
      }),
    ).resolves.toMatchObject({ costCenterId: "cc1" });

    // patchAccount clear + set costCenterId
    const patchAccTx = {
      ledgerAccount: {
        update: jest.fn().mockResolvedValue({ ...accountRow, costCenterId: null }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const patchAcc = new FinanceService(
      {
        ...withTx(patchAccTx),
        ledgerAccount: { findFirst: jest.fn().mockResolvedValue(accountRow) },
        costCenter: { findFirst: jest.fn().mockResolvedValue(cc) },
      } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
      mockStorage as never,
    );
    await patchAcc.patchAccount(treasurer, "acc-caixa", { costCenterId: null });
    await patchAcc.patchAccount(treasurer, "acc-caixa", {
      costCenterId: "cc1",
      costCenter: "  ",
    });
    await patchAcc.patchAccount(treasurer, "acc-caixa", { costCenterId: "" });

    // createEntry edges: empty description, invalid competence, fund/cc
    const entrySvc = new FinanceService(
      {
        accountingPeriod: { findFirst: jest.fn().mockResolvedValue(null) },
        ledgerAccount: {
          findMany: jest.fn().mockResolvedValue([accountRow, revenueRow]),
        },
        fund: { findFirst: jest.fn().mockResolvedValue(fund) },
        costCenter: { findFirst: jest.fn().mockResolvedValue(cc) },
        ...withTx({
          ledgerEntry: {
            create: jest.fn().mockResolvedValue({
              ...entry,
              fundId: "fund1",
              costCenterId: "cc1",
              competenceYear: 2026,
              competenceMonth: 11,
            }),
          },
          auditLog: { create: jest.fn().mockResolvedValue({}) },
        }),
      } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
      mockStorage as never,
    );
    await expect(
      entrySvc.createEntry(treasurer, {
        entryDate: "2026-11-01",
        description: "   ",
        lines: [
          { accountId: "acc-caixa", side: "DEBIT", amountCents: 100 },
          { accountId: "acc-ofertas", side: "CREDIT", amountCents: 100 },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      entrySvc.createEntry(treasurer, {
        entryDate: "2026-11-01",
        description: "ok",
        competenceYear: 1999,
        competenceMonth: 1,
        lines: [
          { accountId: "acc-caixa", side: "DEBIT", amountCents: 100 },
          { accountId: "acc-ofertas", side: "CREDIT", amountCents: 100 },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      entrySvc.createEntry(treasurer, {
        entryDate: "2026-11-01",
        description: "com fundo",
        fundId: "fund1",
        costCenterId: "cc1",
        competenceYear: 2026,
        competenceMonth: 11,
        lines: [
          { accountId: "acc-caixa", side: "DEBIT", amountCents: 100 },
          { accountId: "acc-ofertas", side: "CREDIT", amountCents: 100 },
        ],
      }),
    ).resolves.toMatchObject({ fundId: "fund1" });

    // import: invalid adapter, OFX empty, OFX fail, CSV empty stub, PDF hint
    const importBatches: Record<string, unknown>[] = [];
    const mkImportBatch = (over: Record<string, unknown>) => ({
      id: "b",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      format: "CSV",
      status: "PARSED_STUB",
      adapter: "FILE",
      filename: "x",
      stubNote: "n",
      lineCount: 0,
      createdByUserId: treasurer.userId,
      createdAt: now,
      updatedAt: now,
      lines: [],
      ...over,
    });
    const importCreate = jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const batch = mkImportBatch({
        format: data.format,
        status: data.status,
        adapter: data.adapter,
        filename: data.filename,
        stubNote: data.stubNote,
        lineCount: data.lineCount,
        lines: [],
      });
      importBatches.push(batch);
      return batch;
    });
    const importSvc = new FinanceService(
      {
        ...withTx({
          bankImportBatch: { create: importCreate },
          auditLog: { create: jest.fn().mockResolvedValue({}) },
        }),
      } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
      mockStorage as never,
    );
    await expect(
      importSvc.createImport(treasurer, {
        format: "CSV",
        filename: "x.csv",
        adapter: "LIVE",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      importSvc.createImport(treasurer, { format: "CSV", filename: "empty.csv" }),
    ).resolves.toMatchObject({ status: "PARSED_STUB" });
    await expect(
      importSvc.createImport(treasurer, { format: "OFX", filename: "e.ofx" }),
    ).resolves.toMatchObject({ status: "FAILED" });
    await expect(
      importSvc.createImport(treasurer, {
        format: "OFX",
        filename: "bad.ofx",
        textContent: "<OFX></OFX>",
      }),
    ).resolves.toMatchObject({ status: "FAILED" });
    await expect(
      importSvc.createImport(treasurer, {
        format: "PDF_META",
        filename: "e.pdf",
        textContent: "pages=2 bank=demo",
      }),
    ).resolves.toMatchObject({ status: "META_ONLY" });

    // funds/cc list + patch + conflict
    const listFundsSvc = new FinanceService(
      {
        fund: {
          findMany: jest.fn().mockResolvedValue([fund]),
          findFirst: jest.fn().mockResolvedValue(fund),
          update: jest.fn().mockResolvedValue({ ...fund, active: false }),
          findUnique: jest.fn().mockResolvedValue(fund),
        },
        costCenter: {
          findMany: jest.fn().mockResolvedValue([cc]),
          findFirst: jest.fn().mockResolvedValue(cc),
          update: jest.fn().mockResolvedValue({ ...cc, name: "Adm2" }),
          findUnique: jest.fn().mockResolvedValue(cc),
        },
        auditLog: { create: jest.fn().mockResolvedValue({}) },
        ...withTx({
          fund: {
            findUnique: jest.fn().mockResolvedValue(fund),
            create: jest.fn(),
          },
          costCenter: {
            findUnique: jest.fn().mockResolvedValue(cc),
            create: jest.fn(),
          },
          auditLog: { create: jest.fn().mockResolvedValue({}) },
        }),
      } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
      mockStorage as never,
    );
    await expect(listFundsSvc.listFunds(treasurer)).resolves.toMatchObject({
      funds: [{ code: "GERAL" }],
    });
    await expect(
      listFundsSvc.patchFund(treasurer, "fund1", { active: false, name: "G" }),
    ).resolves.toMatchObject({ active: false });
    await expect(listFundsSvc.listCostCenters(treasurer)).resolves.toMatchObject({
      costCenters: [{ code: "ADM" }],
    });
    await expect(
      listFundsSvc.patchCostCenter(treasurer, "cc1", { name: "Adm2" }),
    ).resolves.toMatchObject({ name: "Adm2" });
    await expect(
      listFundsSvc.createFund(treasurer, { code: "GERAL", name: "x" }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      listFundsSvc.createCostCenter(treasurer, { code: "ADM", name: "x" }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      listFundsSvc.createFund(treasurer, { code: "  ", name: "x" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      listFundsSvc.createCostCenter(treasurer, { code: "X", name: "" }),
    ).rejects.toBeInstanceOf(BadRequestException);

    // budgets densify
    const budSvc = new FinanceService(
      {
        budget: {
          findMany: jest.fn().mockResolvedValue([budgetOpen]),
          findFirst: jest
            .fn()
            .mockResolvedValueOnce(budgetOpen) // getBudget
            .mockResolvedValueOnce(budgetOpen) // patch invalid status
            .mockResolvedValueOnce(budgetClosed) // patch CLOSED→ACTIVE conflict
            .mockResolvedValueOnce(budgetOpen) // patch ACTIVE ok
            .mockResolvedValueOnce(budgetClosed) // addLine CLOSED
            .mockResolvedValueOnce(budgetOpen) // addLine bad plannedCents
            .mockResolvedValueOnce(budgetOpen) // addLine ok
            .mockResolvedValueOnce({
              ...budgetOpen,
              lines: [
                {
                  id: "bl1",
                  accountId: "acc-caixa",
                  fundId: "fund1",
                  costCenterId: "cc1",
                  plannedCents: 1000,
                  notes: null,
                },
              ],
            }),
          update: jest.fn().mockResolvedValue({ ...budgetOpen, status: "ACTIVE" }),
          findUnique: jest.fn().mockResolvedValue(budgetOpen),
        },
        budgetLine: {
          create: jest.fn().mockResolvedValue({
            id: "bl1",
            budgetId: "bud1",
            accountId: "acc-caixa",
            fundId: "fund1",
            costCenterId: "cc1",
            plannedCents: 1000,
            notes: null,
          }),
        },
        ledgerAccount: { findFirst: jest.fn().mockResolvedValue(accountRow) },
        fund: { findFirst: jest.fn().mockResolvedValue(fund) },
        costCenter: { findFirst: jest.fn().mockResolvedValue(cc) },
        auditLog: { create: jest.fn().mockResolvedValue({}) },
        ...withTx({
          budget: {
            findUnique: jest.fn().mockResolvedValue(budgetOpen),
            create: jest.fn(),
          },
          auditLog: { create: jest.fn().mockResolvedValue({}) },
        }),
      } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
      mockStorage as never,
    );
    await expect(budSvc.listBudgets(treasurer, 2026)).resolves.toMatchObject({
      budgets: [{ year: 2026 }],
    });
    await expect(budSvc.getBudget(treasurer, "bud1")).resolves.toMatchObject({
      id: "bud1",
    });
    await expect(
      budSvc.createBudget(treasurer, { year: 2026, title: "Orc" }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      budSvc.createBudget(treasurer, { year: 2026.5 as never, title: "x" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      budSvc.patchBudget(treasurer, "bud1", { status: "NOPE" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    // closed cannot reopen — findFirst returns CLOSED then we try ACTIVE
    await expect(
      budSvc.patchBudget(treasurer, "bud1", { status: "ACTIVE" }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      budSvc.patchBudget(treasurer, "bud1", { status: "ACTIVE", notes: " ok " }),
    ).resolves.toMatchObject({ status: "ACTIVE" });
    await expect(
      budSvc.addBudgetLine(treasurer, "bud1", {
        accountId: "acc-caixa",
        plannedCents: -1,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      budSvc.addBudgetLine(treasurer, "bud1", {
        accountId: "acc-caixa",
        plannedCents: 1.5 as never,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      budSvc.addBudgetLine(treasurer, "bud1", {
        accountId: "acc-caixa",
        plannedCents: 1000,
        fundId: "fund1",
        costCenterId: "cc1",
        notes: "n",
      }),
    ).resolves.toMatchObject({ id: "bud1" });

    // periods densify
    const perSvc = new FinanceService(
      {
        accountingPeriod: {
          findMany: jest.fn().mockResolvedValue([period]),
          findFirst: jest
            .fn()
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ ...period, status: "CLOSED" })
            .mockResolvedValueOnce(period),
          update: jest.fn().mockResolvedValue({
            ...period,
            status: "CLOSED",
            closedAt: now,
            closedByUserId: treasurer.userId,
          }),
        },
        auditLog: { create: jest.fn().mockResolvedValue({}) },
        ...withTx({
          accountingPeriod: {
            findUnique: jest.fn().mockResolvedValue(period),
            create: jest.fn(),
          },
          auditLog: { create: jest.fn().mockResolvedValue({}) },
        }),
      } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
      mockStorage as never,
    );
    await expect(perSvc.listPeriods(treasurer)).resolves.toMatchObject({
      periods: [{ month: 11 }],
    });
    await expect(
      perSvc.openPeriod(treasurer, { year: 1999, month: 1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      perSvc.openPeriod(treasurer, { year: 2026, month: 11 }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(perSvc.closePeriod(treasurer, "missing")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(perSvc.closePeriod(treasurer, "per1")).rejects.toBeInstanceOf(
      ConflictException,
    );

    // attachments densify
    const attSvc = new FinanceService(
      {
        ledgerEntry: { findFirst: jest.fn().mockResolvedValue(entry) },
        ledgerEntryAttachment: {
          findFirst: jest
            .fn()
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(att)
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(att),
          delete: jest.fn().mockResolvedValue(att),
          create: jest.fn().mockResolvedValue({ ...att, contentType: "image/png" }),
        },
        auditLog: { create: jest.fn().mockResolvedValue({}) },
      } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
      mockStorage as never,
    );
    await expect(
      attSvc.uploadAttachment(treasurer, "e1", {
        originalname: "x.exe",
        mimetype: "application/octet-stream",
        buffer: Buffer.from("x"),
        size: 1,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      attSvc.uploadAttachment(treasurer, "e1", {
        originalname: "x.png",
        mimetype: "image/png",
        buffer: Buffer.from(""),
        size: 0,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      attSvc.uploadAttachment(treasurer, "e1", {
        originalname: "foto.png",
        mimetype: "image/png",
        buffer: Buffer.from("PNG"),
        size: 3,
      }),
    ).resolves.toMatchObject({ contentType: "image/png" });
    await expect(
      attSvc.downloadAttachment(treasurer, "e1", "missing"),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      attSvc.downloadAttachment(treasurer, "e1", "att1"),
    ).resolves.toMatchObject({ displayName: "recibo.pdf" });
    await expect(
      attSvc.removeAttachment(treasurer, "e1", "missing"),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      attSvc.removeAttachment(treasurer, "e1", "att1"),
    ).resolves.toMatchObject({ deleted: true });

    // helper 404s
    const miss = new FinanceService(
      {
        fund: { findFirst: jest.fn().mockResolvedValue(null) },
        costCenter: { findFirst: jest.fn().mockResolvedValue(null) },
        budget: { findFirst: jest.fn().mockResolvedValue(null) },
        accountingPeriod: { findFirst: jest.fn().mockResolvedValue(null) },
      } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
      mockStorage as never,
    );
    await expect(miss.patchFund(treasurer, "x", {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(miss.patchCostCenter(treasurer, "x", {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(miss.getBudget(treasurer, "x")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(miss.closePeriod(treasurer, "x")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

});
