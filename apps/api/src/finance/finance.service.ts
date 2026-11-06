import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  BANK_IMPORT_FORMATS,
  LEDGER_ACCOUNT_TYPES,
  canAccessFinance,
  checkBalancedLines,
  nextDualApprovalStage,
  parseSyntheticCsvLines,
  type BankImportFormatCode,
  type LedgerAccountTypeCode,
  type LedgerLineInput,
} from "@idbrf/shared";
import type { AuthUser } from "../auth/types/auth-user";
import { PrismaService } from "../prisma/prisma.service";
import { PilotService } from "../pilot/pilot.service";

type PilotScope = {
  organizationId: string;
  churchId: string;
};

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pilot: PilotService,
  ) {}

  // —— Plano de contas ——

  async listAccounts(actor: AuthUser) {
    const pilot = await this.requireFinance(actor);
    const accounts = await this.prisma.ledgerAccount.findMany({
      where: {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      },
      orderBy: { code: "asc" },
    });
    return {
      churchId: pilot.churchId,
      accounts: accounts.map((a) => this.toAccountDto(a)),
    };
  }

  async createAccount(
    actor: AuthUser,
    input: {
      code: string;
      name: string;
      type: string;
      parentId?: string;
      costCenter?: string;
    },
  ) {
    const pilot = await this.requireFinance(actor);
    const code = input.code?.trim();
    const name = input.name?.trim();
    if (!code || !name) {
      throw new BadRequestException("code e name são obrigatórios");
    }
    const type = this.requireAccountType(input.type);
    if (input.parentId) {
      await this.requireAccountInPilot(pilot, input.parentId);
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.ledgerAccount.findUnique({
        where: {
          churchId_code: { churchId: pilot.churchId, code },
        },
      });
      if (existing) {
        throw new ConflictException({
          code: "LEDGER_ACCOUNT_CODE_EXISTS",
          message: "Código já existe neste plano de contas",
        });
      }

      const row = await tx.ledgerAccount.create({
        data: {
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          code,
          name,
          type,
          parentId: input.parentId ?? null,
          costCenter: input.costCenter?.trim() || null,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "ledger.account.create",
          resourceType: "ledger_account",
          resourceId: row.id,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: { code, type },
        },
      });

      return this.toAccountDto(row);
    });
  }

  async getAccount(actor: AuthUser, accountId: string) {
    const pilot = await this.requireFinance(actor);
    const row = await this.requireAccountInPilot(pilot, accountId);
    return this.toAccountDto(row);
  }

  async patchAccount(
    actor: AuthUser,
    accountId: string,
    input: { name?: string; active?: boolean; costCenter?: string | null },
  ) {
    const pilot = await this.requireFinance(actor);
    await this.requireAccountInPilot(pilot, accountId);

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.ledgerAccount.update({
        where: { id: accountId },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
          ...(input.costCenter !== undefined
            ? { costCenter: input.costCenter?.trim() || null }
            : {}),
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "ledger.account.patch",
          resourceType: "ledger_account",
          resourceId: row.id,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: { active: row.active },
        },
      });

      return this.toAccountDto(row);
    });
  }

  // —— Lançamentos ——

  async listEntries(actor: AuthUser, status?: string) {
    const pilot = await this.requireFinance(actor);
    const rows = await this.prisma.ledgerEntry.findMany({
      where: {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        ...(status ? { status: status as never } : {}),
      },
      orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
      include: { lines: true },
    });
    return {
      churchId: pilot.churchId,
      entries: rows.map((r) => this.toEntryDto(r)),
    };
  }

  async createEntry(
    actor: AuthUser,
    input: {
      entryDate: string;
      description: string;
      lines: LedgerLineInput[];
    },
  ) {
    const pilot = await this.requireFinance(actor);
    const description = input.description?.trim();
    if (!description) {
      throw new BadRequestException("description é obrigatória");
    }
    const entryDate = this.parseDateOnly(input.entryDate, "entryDate");
    const balance = checkBalancedLines(input.lines ?? []);
    if (!balance.ok) {
      throw new BadRequestException({
        code: "LEDGER_ENTRY_UNBALANCED",
        message: "Lançamento desbalanceado",
        reason: balance.reason,
      });
    }

    const accountIds = [...new Set(input.lines.map((l) => l.accountId))];
    const accounts = await this.prisma.ledgerAccount.findMany({
      where: {
        id: { in: accountIds },
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        active: true,
      },
    });
    if (accounts.length !== accountIds.length) {
      throw new BadRequestException("Conta inválida ou inativa no escopo");
    }

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.ledgerEntry.create({
        data: {
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          entryDate,
          description,
          status: "DRAFT",
          amountCents: balance.amountCents,
          createdByUserId: actor.userId,
          lines: {
            create: input.lines.map((l) => ({
              accountId: l.accountId,
              side: l.side as "DEBIT" | "CREDIT",
              amountCents: l.amountCents,
              memo: l.memo?.trim() || null,
            })),
          },
        },
        include: { lines: true },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "ledger.entry.create",
          resourceType: "ledger_entry",
          resourceId: row.id,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: { amountCents: row.amountCents },
        },
      });

      return this.toEntryDto(row);
    });
  }

  async getEntry(actor: AuthUser, entryId: string) {
    const pilot = await this.requireFinance(actor);
    const row = await this.requireEntryInPilot(pilot, entryId);
    return this.toEntryDto(row);
  }

  async submitEntry(actor: AuthUser, entryId: string) {
    const pilot = await this.requireFinance(actor);
    const row = await this.requireEntryInPilot(pilot, entryId);
    if (row.status !== "DRAFT" && row.status !== "REJECTED") {
      throw new ConflictException({
        code: "LEDGER_ENTRY_NOT_SUBMITTABLE",
        message: "Só DRAFT/REJECTED podem ser submetidos",
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.ledgerEntry.update({
        where: { id: entryId },
        data: {
          status: "PENDING_APPROVAL",
          submittedAt: new Date(),
          firstApprovedByUserId: null,
          firstApprovedAt: null,
          secondApprovedByUserId: null,
          secondApprovedAt: null,
          rejectedByUserId: null,
          rejectedAt: null,
          rejectionReason: null,
        },
        include: { lines: true },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "ledger.entry.submit",
          resourceType: "ledger_entry",
          resourceId: entryId,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
        },
      });

      return this.toEntryDto(updated);
    });
  }

  async approveEntry(actor: AuthUser, entryId: string) {
    const pilot = await this.requireFinance(actor);
    const row = await this.requireEntryInPilot(pilot, entryId);
    if (row.status !== "PENDING_APPROVAL") {
      throw new ConflictException({
        code: "LEDGER_ENTRY_NOT_PENDING",
        message: "Entrada não está pendente de aprovação",
      });
    }

    const stage = nextDualApprovalStage({
      actorUserId: actor.userId,
      createdByUserId: row.createdByUserId,
      firstApprovedByUserId: row.firstApprovedByUserId,
    });
    if (!stage.ok) {
      throw new ConflictException({
        code: stage.code,
        message: "Dupla aprovação inválida para este ator",
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const data =
        stage.stage === "FIRST"
          ? {
              firstApprovedByUserId: actor.userId,
              firstApprovedAt: new Date(),
            }
          : {
              secondApprovedByUserId: actor.userId,
              secondApprovedAt: new Date(),
              status: "APPROVED" as const,
            };

      const updated = await tx.ledgerEntry.update({
        where: { id: entryId },
        data,
        include: { lines: true },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action:
            stage.stage === "FIRST"
              ? "ledger.entry.approve.first"
              : "ledger.entry.approve.second",
          resourceType: "ledger_entry",
          resourceId: entryId,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
        },
      });

      return this.toEntryDto(updated);
    });
  }

  async rejectEntry(
    actor: AuthUser,
    entryId: string,
    reason?: string,
  ) {
    const pilot = await this.requireFinance(actor);
    const row = await this.requireEntryInPilot(pilot, entryId);
    if (row.status !== "PENDING_APPROVAL") {
      throw new ConflictException({
        code: "LEDGER_ENTRY_NOT_PENDING",
        message: "Entrada não está pendente de aprovação",
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.ledgerEntry.update({
        where: { id: entryId },
        data: {
          status: "REJECTED",
          rejectedByUserId: actor.userId,
          rejectedAt: new Date(),
          rejectionReason: reason?.trim() || null,
        },
        include: { lines: true },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "ledger.entry.reject",
          resourceType: "ledger_entry",
          resourceId: entryId,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
        },
      });

      return this.toEntryDto(updated);
    });
  }

  async reverseEntry(actor: AuthUser, entryId: string) {
    const pilot = await this.requireFinance(actor);
    const row = await this.requireEntryInPilot(pilot, entryId);
    if (row.status !== "APPROVED") {
      throw new ConflictException({
        code: "LEDGER_ENTRY_NOT_APPROVED",
        message: "Só lançamentos APPROVED podem ser estornados",
      });
    }
    if (row.reversedBy || row.reversalOfEntryId) {
      throw new ConflictException({
        code: "LEDGER_ENTRY_ALREADY_REVERSED",
        message: "Lançamento já estornado",
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const reversal = await tx.ledgerEntry.create({
        data: {
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          entryDate: new Date(),
          description: `Estorno de ${row.id}: ${row.description}`,
          status: "APPROVED",
          amountCents: row.amountCents,
          createdByUserId: actor.userId,
          submittedAt: new Date(),
          firstApprovedByUserId: actor.userId,
          firstApprovedAt: new Date(),
          secondApprovedByUserId: actor.userId,
          secondApprovedAt: new Date(),
          reversalOfEntryId: row.id,
          lines: {
            create: row.lines.map((l) => ({
              accountId: l.accountId,
              side: l.side === "DEBIT" ? "CREDIT" : "DEBIT",
              amountCents: l.amountCents,
              memo: `estorno:${l.id}`,
            })),
          },
        },
        include: { lines: true },
      });

      await tx.ledgerEntry.update({
        where: { id: row.id },
        data: { status: "REVERSED" },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "ledger.entry.reverse",
          resourceType: "ledger_entry",
          resourceId: row.id,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: { reversalId: reversal.id },
        },
      });

      return this.toEntryDto(reversal);
    });
  }

  // —— Import stubs ——

  async listImports(actor: AuthUser) {
    const pilot = await this.requireFinance(actor);
    const batches = await this.prisma.bankImportBatch.findMany({
      where: {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      },
      orderBy: { createdAt: "desc" },
      include: { lines: true },
    });
    return {
      churchId: pilot.churchId,
      batches: batches.map((b) => this.toImportDto(b)),
    };
  }

  async createImport(
    actor: AuthUser,
    input: {
      format: string;
      filename: string;
      textContent?: string;
    },
  ) {
    const pilot = await this.requireFinance(actor);
    const format = this.requireImportFormat(input.format);
    const filename = input.filename?.trim();
    if (!filename) {
      throw new BadRequestException("filename é obrigatório");
    }

    let stubNote: string;
    let parsed: ReturnType<typeof parseSyntheticCsvLines> = [];
    let status: "PARSED_STUB" | "FAILED" = "PARSED_STUB";

    if (format === "CSV") {
      stubNote = "CSV sintético — parser mínimo date,amountCents,description";
      if (input.textContent?.trim()) {
        parsed = parseSyntheticCsvLines(input.textContent);
        if (!parsed.length) {
          status = "FAILED";
          stubNote = "CSV sem linhas válidas";
        }
      } else {
        stubNote = "CSV recebido sem conteúdo — lote vazio (stub)";
      }
    } else if (format === "OFX") {
      stubNote =
        "OFX parser não implementado nesta fase — metadados apenas (stub)";
      parsed = [];
    } else {
      stubNote =
        "PDF estruturado não parseado — somente metadados do arquivo (stub)";
      parsed = [];
    }

    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.bankImportBatch.create({
        data: {
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          format,
          status,
          filename,
          stubNote,
          lineCount: parsed.length,
          createdByUserId: actor.userId,
          lines: {
            create: parsed.map(
              (p: {
                postedAt: string;
                amountCents: number;
                description: string;
                externalRef: string | null;
              }) => ({
                postedAt: this.parseLooseDate(p.postedAt),
                amountCents: p.amountCents,
                description: p.description,
                externalRef: p.externalRef,
                matchStatus: "UNMATCHED" as const,
              }),
            ),
          },
        },
        include: { lines: true },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "ledger.import.create",
          resourceType: "bank_import_batch",
          resourceId: batch.id,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: { format, status, lineCount: batch.lineCount },
        },
      });

      return this.toImportDto(batch);
    });
  }

  async getImport(actor: AuthUser, batchId: string) {
    const pilot = await this.requireFinance(actor);
    const batch = await this.prisma.bankImportBatch.findFirst({
      where: {
        id: batchId,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      },
      include: { lines: true },
    });
    if (!batch) {
      throw new NotFoundException("Lote de importação não encontrado");
    }
    return this.toImportDto(batch);
  }

  // —— Conciliação ——

  async listReconciliations(actor: AuthUser) {
    const pilot = await this.requireFinance(actor);
    const rows = await this.prisma.reconciliation.findMany({
      where: {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      },
      orderBy: { periodStart: "desc" },
    });
    return {
      churchId: pilot.churchId,
      reconciliations: rows.map((r) => this.toReconciliationDto(r)),
    };
  }

  async createReconciliation(
    actor: AuthUser,
    input: {
      title: string;
      periodStart: string;
      periodEnd: string;
      notes?: string;
    },
  ) {
    const pilot = await this.requireFinance(actor);
    const title = input.title?.trim();
    if (!title) {
      throw new BadRequestException("title é obrigatório");
    }
    const periodStart = this.parseDateOnly(input.periodStart, "periodStart");
    const periodEnd = this.parseDateOnly(input.periodEnd, "periodEnd");
    if (periodEnd.getTime() < periodStart.getTime()) {
      throw new BadRequestException("periodEnd deve ser ≥ periodStart");
    }

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.reconciliation.create({
        data: {
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          title,
          periodStart,
          periodEnd,
          notes: input.notes?.trim() || null,
          createdByUserId: actor.userId,
          status: "OPEN",
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "ledger.reconciliation.create",
          resourceType: "reconciliation",
          resourceId: row.id,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: {
            periodStart: input.periodStart,
            periodEnd: input.periodEnd,
          },
        },
      });

      return this.toReconciliationDto(row);
    });
  }

  async getReconciliation(actor: AuthUser, reconciliationId: string) {
    const pilot = await this.requireFinance(actor);
    const row = await this.requireReconciliationInPilot(
      pilot,
      reconciliationId,
    );
    return this.toReconciliationDto(row);
  }

  async submitReconciliation(actor: AuthUser, reconciliationId: string) {
    const pilot = await this.requireFinance(actor);
    const row = await this.requireReconciliationInPilot(
      pilot,
      reconciliationId,
    );
    if (row.status !== "OPEN") {
      throw new ConflictException({
        code: "RECONCILIATION_NOT_OPEN",
        message: "Só OPEN pode ir para aprovação",
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.reconciliation.update({
        where: { id: reconciliationId },
        data: {
          status: "PENDING_APPROVAL",
          firstApprovedByUserId: null,
          firstApprovedAt: null,
          secondApprovedByUserId: null,
          secondApprovedAt: null,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "ledger.reconciliation.submit",
          resourceType: "reconciliation",
          resourceId: reconciliationId,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
        },
      });

      return this.toReconciliationDto(updated);
    });
  }

  async approveReconciliation(actor: AuthUser, reconciliationId: string) {
    const pilot = await this.requireFinance(actor);
    const row = await this.requireReconciliationInPilot(
      pilot,
      reconciliationId,
    );
    if (row.status !== "PENDING_APPROVAL") {
      throw new ConflictException({
        code: "RECONCILIATION_NOT_PENDING",
        message: "Conciliação não está pendente",
      });
    }

    const stage = nextDualApprovalStage({
      actorUserId: actor.userId,
      createdByUserId: row.createdByUserId,
      firstApprovedByUserId: row.firstApprovedByUserId,
    });
    if (!stage.ok) {
      throw new ConflictException({
        code: stage.code,
        message: "Dupla aprovação inválida para este ator",
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const data =
        stage.stage === "FIRST"
          ? {
              firstApprovedByUserId: actor.userId,
              firstApprovedAt: new Date(),
            }
          : {
              secondApprovedByUserId: actor.userId,
              secondApprovedAt: new Date(),
              status: "APPROVED" as const,
            };

      const updated = await tx.reconciliation.update({
        where: { id: reconciliationId },
        data,
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action:
            stage.stage === "FIRST"
              ? "ledger.reconciliation.approve.first"
              : "ledger.reconciliation.approve.second",
          resourceType: "reconciliation",
          resourceId: reconciliationId,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
        },
      });

      return this.toReconciliationDto(updated);
    });
  }

  async closeReconciliation(actor: AuthUser, reconciliationId: string) {
    const pilot = await this.requireFinance(actor);
    const row = await this.requireReconciliationInPilot(
      pilot,
      reconciliationId,
    );
    if (row.status !== "APPROVED") {
      throw new ConflictException({
        code: "RECONCILIATION_NOT_APPROVED",
        message: "Só APPROVED pode fechar",
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.reconciliation.update({
        where: { id: reconciliationId },
        data: { status: "CLOSED", closedAt: new Date() },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "ledger.reconciliation.close",
          resourceType: "reconciliation",
          resourceId: reconciliationId,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
        },
      });

      return this.toReconciliationDto(updated);
    });
  }

  // —— helpers ——

  private async requireFinance(actor: AuthUser): Promise<PilotScope> {
    const pilot = await this.pilot.getPilotChurch();
    if (
      !canAccessFinance(actor.grants, {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      })
    ) {
      throw new ForbiddenException(
        "Sem permissão de tesouraria nesta congregação",
      );
    }
    return {
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
    };
  }

  private requireAccountType(type: string): LedgerAccountTypeCode {
    if (!LEDGER_ACCOUNT_TYPES.includes(type as LedgerAccountTypeCode)) {
      throw new BadRequestException("type de conta inválido");
    }
    return type as LedgerAccountTypeCode;
  }

  private requireImportFormat(format: string): BankImportFormatCode {
    if (!BANK_IMPORT_FORMATS.includes(format as BankImportFormatCode)) {
      throw new BadRequestException("format de importação inválido");
    }
    return format as BankImportFormatCode;
  }

  private parseDateOnly(raw: string, field: string): Date {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException(`${field} inválido`);
    }
    return d;
  }

  private parseLooseDate(raw: string): Date {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? new Date() : d;
  }

  private async requireAccountInPilot(pilot: PilotScope, accountId: string) {
    const row = await this.prisma.ledgerAccount.findFirst({
      where: {
        id: accountId,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      },
    });
    if (!row) {
      throw new NotFoundException("Conta não encontrada");
    }
    return row;
  }

  private async requireEntryInPilot(pilot: PilotScope, entryId: string) {
    const row = await this.prisma.ledgerEntry.findFirst({
      where: {
        id: entryId,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      },
      include: {
        lines: true,
        reversedBy: { select: { id: true } },
      },
    });
    if (!row) {
      throw new NotFoundException("Lançamento não encontrado");
    }
    return row;
  }

  private async requireReconciliationInPilot(
    pilot: PilotScope,
    reconciliationId: string,
  ) {
    const row = await this.prisma.reconciliation.findFirst({
      where: {
        id: reconciliationId,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      },
    });
    if (!row) {
      throw new NotFoundException("Conciliação não encontrada");
    }
    return row;
  }

  private toAccountDto(row: {
    id: string;
    churchId: string;
    code: string;
    name: string;
    type: string;
    parentId: string | null;
    costCenter: string | null;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      churchId: row.churchId,
      code: row.code,
      name: row.name,
      type: row.type,
      parentId: row.parentId,
      costCenter: row.costCenter,
      active: row.active,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toEntryDto(row: {
    id: string;
    churchId: string;
    entryDate: Date;
    description: string;
    status: string;
    amountCents: number;
    createdByUserId: string;
    submittedAt: Date | null;
    firstApprovedByUserId: string | null;
    firstApprovedAt: Date | null;
    secondApprovedByUserId: string | null;
    secondApprovedAt: Date | null;
    rejectedByUserId: string | null;
    rejectedAt: Date | null;
    rejectionReason: string | null;
    reversalOfEntryId: string | null;
    importBatchId: string | null;
    reconciliationId: string | null;
    createdAt: Date;
    updatedAt: Date;
    lines: Array<{
      id: string;
      accountId: string;
      side: string;
      amountCents: number;
      memo: string | null;
    }>;
  }) {
    return {
      id: row.id,
      churchId: row.churchId,
      entryDate: row.entryDate.toISOString().slice(0, 10),
      description: row.description,
      status: row.status,
      amountCents: row.amountCents,
      createdByUserId: row.createdByUserId,
      submittedAt: row.submittedAt?.toISOString() ?? null,
      firstApprovedByUserId: row.firstApprovedByUserId,
      firstApprovedAt: row.firstApprovedAt?.toISOString() ?? null,
      secondApprovedByUserId: row.secondApprovedByUserId,
      secondApprovedAt: row.secondApprovedAt?.toISOString() ?? null,
      rejectedByUserId: row.rejectedByUserId,
      rejectedAt: row.rejectedAt?.toISOString() ?? null,
      rejectionReason: row.rejectionReason,
      reversalOfEntryId: row.reversalOfEntryId,
      importBatchId: row.importBatchId,
      reconciliationId: row.reconciliationId,
      lines: row.lines.map((l) => ({
        id: l.id,
        accountId: l.accountId,
        side: l.side,
        amountCents: l.amountCents,
        memo: l.memo,
      })),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toImportDto(row: {
    id: string;
    churchId: string;
    format: string;
    status: string;
    filename: string;
    stubNote: string | null;
    lineCount: number;
    createdByUserId: string;
    createdAt: Date;
    updatedAt: Date;
    lines: Array<{
      id: string;
      postedAt: Date;
      amountCents: number;
      description: string;
      externalRef: string | null;
      matchStatus: string;
      matchedEntryId: string | null;
    }>;
  }) {
    return {
      id: row.id,
      churchId: row.churchId,
      format: row.format,
      status: row.status,
      filename: row.filename,
      stubNote: row.stubNote,
      lineCount: row.lineCount,
      createdByUserId: row.createdByUserId,
      lines: row.lines.map((l) => ({
        id: l.id,
        postedAt: l.postedAt.toISOString(),
        amountCents: l.amountCents,
        description: l.description,
        externalRef: l.externalRef,
        matchStatus: l.matchStatus,
        matchedEntryId: l.matchedEntryId,
      })),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toReconciliationDto(row: {
    id: string;
    churchId: string;
    title: string;
    periodStart: Date;
    periodEnd: Date;
    status: string;
    notes: string | null;
    createdByUserId: string;
    firstApprovedByUserId: string | null;
    firstApprovedAt: Date | null;
    secondApprovedByUserId: string | null;
    secondApprovedAt: Date | null;
    closedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      churchId: row.churchId,
      title: row.title,
      periodStart: row.periodStart.toISOString().slice(0, 10),
      periodEnd: row.periodEnd.toISOString().slice(0, 10),
      status: row.status,
      notes: row.notes,
      createdByUserId: row.createdByUserId,
      firstApprovedByUserId: row.firstApprovedByUserId,
      firstApprovedAt: row.firstApprovedAt?.toISOString() ?? null,
      secondApprovedByUserId: row.secondApprovedByUserId,
      secondApprovedAt: row.secondApprovedAt?.toISOString() ?? null,
      closedAt: row.closedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
