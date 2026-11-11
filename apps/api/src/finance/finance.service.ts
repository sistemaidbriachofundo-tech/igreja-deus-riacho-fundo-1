import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  BANK_IMPORT_ADAPTERS,
  BANK_IMPORT_FORMATS,
  BUDGET_STATUSES,
  LEDGER_ACCOUNT_TYPES,
  canAccessFinance,
  hasAccess,
  ROLE_CODES,
  checkBalancedLines,
  isValidCompetence,
  nextDualApprovalStage,
  parseOfxLines,
  parseSyntheticCsvLines,
  type BankImportAdapterCode,
  type BankImportFormatCode,
  type BudgetStatusCode,
  type LedgerAccountTypeCode,
  type LedgerLineInput,
} from "@idbrf/shared";
import type { AuthUser } from "../auth/types/auth-user";
import { PrismaService } from "../prisma/prisma.service";
import { PilotService } from "../pilot/pilot.service";
import { PrivateStorageService } from "../storage/private-storage.service";
import { listBankAdapters, requireBankAdapter } from "./bank-adapters";

type PilotScope = {
  organizationId: string;
  churchId: string;
};

const ATTACHMENT_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);
const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pilot: PilotService,
    private readonly storage: PrivateStorageService,
  ) {}

  listBankAdapters() {
    return { adapters: listBankAdapters(), liveBankApis: false as const };
  }

  // —— Plano de contas ——

  async listAccounts(actor: AuthUser) {
    const pilot = await this.requireFinance(actor, "read");
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
      costCenterId?: string;
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
    let costCenterLabel = input.costCenter?.trim() || null;
    let costCenterId: string | null = null;
    if (input.costCenterId) {
      const cc = await this.requireCostCenterInPilot(pilot, input.costCenterId);
      costCenterId = cc.id;
      costCenterLabel = costCenterLabel ?? cc.code;
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
          costCenter: costCenterLabel,
          costCenterId,
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
          metadata: { code, type, costCenterId },
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
    input: {
      name?: string;
      active?: boolean;
      costCenter?: string | null;
      costCenterId?: string | null;
    },
  ) {
    const pilot = await this.requireFinance(actor);
    await this.requireAccountInPilot(pilot, accountId);

    let costCenterIdPatch: string | null | undefined;
    let costCenterLabelPatch: string | null | undefined;
    if (input.costCenterId !== undefined) {
      if (input.costCenterId === null || input.costCenterId === "") {
        costCenterIdPatch = null;
      } else {
        const cc = await this.requireCostCenterInPilot(
          pilot,
          input.costCenterId,
        );
        costCenterIdPatch = cc.id;
        costCenterLabelPatch = cc.code;
      }
    }
    if (input.costCenter !== undefined) {
      costCenterLabelPatch = input.costCenter?.trim() || null;
    }

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.ledgerAccount.update({
        where: { id: accountId },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
          ...(costCenterLabelPatch !== undefined
            ? { costCenter: costCenterLabelPatch }
            : {}),
          ...(costCenterIdPatch !== undefined
            ? { costCenterId: costCenterIdPatch }
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
          metadata: { active: row.active, costCenterId: row.costCenterId },
        },
      });

      return this.toAccountDto(row);
    });
  }

  // —— Lançamentos ——

  async listEntries(actor: AuthUser, status?: string) {
    const pilot = await this.requireFinance(actor, "read");
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
      fundId?: string;
      costCenterId?: string;
      competenceYear?: number;
      competenceMonth?: number;
    },
  ) {
    const pilot = await this.requireFinance(actor);
    const description = input.description?.trim();
    if (!description) {
      throw new BadRequestException("description é obrigatória");
    }
    const entryDate = this.parseDateOnly(input.entryDate, "entryDate");
    const competenceYear =
      input.competenceYear ?? entryDate.getUTCFullYear();
    const competenceMonth =
      input.competenceMonth ?? entryDate.getUTCMonth() + 1;
    if (!isValidCompetence(competenceYear, competenceMonth)) {
      throw new BadRequestException({
        code: "INVALID_COMPETENCE",
        message: "competenceYear/Month inválidos",
      });
    }

    const balance = checkBalancedLines(input.lines ?? []);
    if (!balance.ok) {
      throw new BadRequestException({
        code: "LEDGER_ENTRY_UNBALANCED",
        message: "Lançamento desbalanceado",
        reason: balance.reason,
      });
    }

    await this.assertPeriodOpen(pilot, competenceYear, competenceMonth);

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

    let fundId: string | null = null;
    let costCenterId: string | null = null;
    if (input.fundId) {
      fundId = (await this.requireFundInPilot(pilot, input.fundId)).id;
    }
    if (input.costCenterId) {
      costCenterId = (
        await this.requireCostCenterInPilot(pilot, input.costCenterId)
      ).id;
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
          fundId,
          costCenterId,
          competenceYear,
          competenceMonth,
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
          metadata: {
            amountCents: row.amountCents,
            fundId,
            costCenterId,
            competenceYear,
            competenceMonth,
          },
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
      adapter?: string;
    },
  ) {
    const pilot = await this.requireFinance(actor);
    const format = this.requireImportFormat(input.format);
    const filename = input.filename?.trim();
    if (!filename) {
      throw new BadRequestException("filename é obrigatório");
    }
    let adapter: BankImportAdapterCode = "FILE";
    try {
      adapter = requireBankAdapter(input.adapter);
    } catch {
      throw new BadRequestException({
        code: "INVALID_BANK_ADAPTER",
        message: `adapter inválido — use ${BANK_IMPORT_ADAPTERS.join("|")}`,
      });
    }

    let stubNote: string;
    let parsed: Array<{
      postedAt: string;
      amountCents: number;
      description: string;
      externalRef: string | null;
    }> = [];
    let status: "PARSED" | "PARSED_STUB" | "META_ONLY" | "FAILED" = "PARSED_STUB";

    if (format === "CSV") {
      stubNote = "CSV sintético — parser mínimo date,amountCents,description";
      if (input.textContent?.trim()) {
        parsed = parseSyntheticCsvLines(input.textContent);
        if (!parsed.length) {
          status = "FAILED";
          stubNote = "CSV sem linhas válidas";
        } else {
          status = "PARSED";
        }
      } else {
        stubNote = "CSV recebido sem conteúdo — lote vazio (stub)";
        status = "PARSED_STUB";
      }
    } else if (format === "OFX") {
      if (!input.textContent?.trim()) {
        status = "FAILED";
        stubNote = "OFX sem textContent — parser real exige payload SGML/XML";
        parsed = [];
      } else {
        const ofx = parseOfxLines(input.textContent);
        if (!ofx.ok) {
          status = "FAILED";
          stubNote = `OFX parse falhou (${ofx.reason ?? "UNKNOWN"})`;
          parsed = [];
        } else {
          status = "PARSED";
          stubNote = `OFX parseado (${adapter}) — ${ofx.lines.length} linha(s); sem postagem automática`;
          parsed = ofx.lines;
        }
      }
    } else {
      // PDF_META — limitação honesta: sem OCR/tabela nesta fatia.
      status = "META_ONLY";
      parsed = [];
      const metaHint = input.textContent?.trim()?.slice(0, 200) || null;
      stubNote = metaHint
        ? `PDF_META: somente metadados (META_ONLY). Extrato tabular/OCR fora de escopo. hint=${metaHint}`
        : "PDF_META: somente metadados do arquivo (META_ONLY) — 0 linhas; OCR/tabela não implementados";
    }

    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.bankImportBatch.create({
        data: {
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          format,
          status,
          adapter,
          filename,
          stubNote,
          lineCount: parsed.length,
          createdByUserId: actor.userId,
          lines: {
            create: parsed.map((p) => ({
              postedAt: this.parseLooseDate(p.postedAt),
              amountCents: p.amountCents,
              description: p.description,
              externalRef: p.externalRef,
              matchStatus: "UNMATCHED" as const,
            })),
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
          metadata: {
            format,
            status,
            adapter,
            lineCount: batch.lineCount,
            liveBankApi: false,
          },
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
    const pilot = await this.requireFinance(actor, "read");
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

  // —— Matching BankStatementLine ↔ LedgerEntry ——

  async matchBankLine(
    actor: AuthUser,
    lineId: string,
    input: { entryId: string; reconciliationId?: string },
  ) {
    const pilot = await this.requireFinance(actor);
    const entryId = input.entryId?.trim();
    if (!entryId) {
      throw new BadRequestException("entryId é obrigatório");
    }

    const line = await this.requireBankLineInPilot(pilot, lineId);
    if (line.matchStatus === "IGNORED") {
      throw new ConflictException({
        code: "BANK_LINE_IGNORED",
        message: "Linha IGNORED não pode ser casada",
      });
    }
    if (
      line.matchStatus === "MATCHED" &&
      line.matchedEntryId &&
      line.matchedEntryId !== entryId
    ) {
      throw new ConflictException({
        code: "BANK_LINE_ALREADY_MATCHED",
        message: "Linha já casada com outro lançamento — faça unmatch antes",
      });
    }

    const entry = await this.requireEntryInPilot(pilot, entryId);
    if (Math.abs(line.amountCents) !== Math.abs(entry.amountCents)) {
      throw new ConflictException({
        code: "BANK_LINE_AMOUNT_MISMATCH",
        message:
          "amountCents da linha e do lançamento devem coincidir (valor absoluto)",
      });
    }

    const otherMatch = await this.prisma.bankStatementLine.findFirst({
      where: {
        matchedEntryId: entryId,
        id: { not: lineId },
        matchStatus: "MATCHED",
      },
      select: { id: true },
    });
    if (otherMatch) {
      throw new ConflictException({
        code: "LEDGER_ENTRY_ALREADY_MATCHED",
        message: "Lançamento já casado com outra linha do extrato",
      });
    }

    let reconciliationId: string | null = input.reconciliationId?.trim() || null;
    if (reconciliationId) {
      const rec = await this.requireReconciliationInPilot(
        pilot,
        reconciliationId,
      );
      if (rec.status === "CLOSED") {
        throw new ConflictException({
          code: "RECONCILIATION_CLOSED",
          message: "Não é possível casar linhas em conciliação CLOSED",
        });
      }
    } else if (entry.reconciliationId) {
      reconciliationId = entry.reconciliationId;
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.bankStatementLine.update({
        where: { id: lineId },
        data: {
          matchStatus: "MATCHED",
          matchedEntryId: entryId,
        },
      });

      if (reconciliationId && entry.reconciliationId !== reconciliationId) {
        await tx.ledgerEntry.update({
          where: { id: entryId },
          data: { reconciliationId },
        });
      }

      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "ledger.bank_line.match",
          resourceType: "bank_statement_line",
          resourceId: lineId,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: {
            entryId,
            reconciliationId,
            amountCents: line.amountCents,
          },
        },
      });

      return this.toBankLineDto(updated);
    });
  }

  async unmatchBankLine(actor: AuthUser, lineId: string) {
    const pilot = await this.requireFinance(actor);
    const line = await this.requireBankLineInPilot(pilot, lineId);

    if (line.matchStatus !== "MATCHED" && line.matchStatus !== "SUGGESTED") {
      throw new ConflictException({
        code: "BANK_LINE_NOT_MATCHED",
        message: "Só MATCHED/SUGGESTED podem ser desfeitos",
      });
    }

    if (line.matchedEntryId) {
      const entry = await this.prisma.ledgerEntry.findFirst({
        where: {
          id: line.matchedEntryId,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
        },
        select: { reconciliationId: true },
      });
      if (entry?.reconciliationId) {
        const rec = await this.prisma.reconciliation.findFirst({
          where: { id: entry.reconciliationId },
          select: { status: true },
        });
        if (rec?.status === "CLOSED") {
          throw new ConflictException({
            code: "RECONCILIATION_CLOSED",
            message: "Não é possível desfazer match de conciliação CLOSED",
          });
        }
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.bankStatementLine.update({
        where: { id: lineId },
        data: {
          matchStatus: "UNMATCHED",
          matchedEntryId: null,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "ledger.bank_line.unmatch",
          resourceType: "bank_statement_line",
          resourceId: lineId,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: {
            previousEntryId: line.matchedEntryId,
            previousStatus: line.matchStatus,
          },
        },
      });

      return this.toBankLineDto(updated);
    });
  }

  // —— Fundos / centros de custo (RF-016) ——

  async listFunds(actor: AuthUser) {
    const pilot = await this.requireFinance(actor);
    const rows = await this.prisma.fund.findMany({
      where: {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      },
      orderBy: { code: "asc" },
    });
    return {
      churchId: pilot.churchId,
      funds: rows.map((r) => this.toFundDto(r)),
    };
  }

  async createFund(
    actor: AuthUser,
    input: { code: string; name: string },
  ) {
    const pilot = await this.requireFinance(actor);
    const code = input.code?.trim();
    const name = input.name?.trim();
    if (!code || !name) {
      throw new BadRequestException("code e name são obrigatórios");
    }
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.fund.findUnique({
        where: { churchId_code: { churchId: pilot.churchId, code } },
      });
      if (existing) {
        throw new ConflictException({
          code: "FUND_CODE_EXISTS",
          message: "Código de fundo já existe",
        });
      }
      const row = await tx.fund.create({
        data: {
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          code,
          name,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "ledger.fund.create",
          resourceType: "fund",
          resourceId: row.id,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: { code },
        },
      });
      return this.toFundDto(row);
    });
  }

  async patchFund(
    actor: AuthUser,
    fundId: string,
    input: { name?: string; active?: boolean },
  ) {
    const pilot = await this.requireFinance(actor);
    await this.requireFundInPilot(pilot, fundId);
    const row = await this.prisma.fund.update({
      where: { id: fundId },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
    });
    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.userId,
        action: "ledger.fund.patch",
        resourceType: "fund",
        resourceId: row.id,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        metadata: { active: row.active },
      },
    });
    return this.toFundDto(row);
  }

  async listCostCenters(actor: AuthUser) {
    const pilot = await this.requireFinance(actor, "read");
    const rows = await this.prisma.costCenter.findMany({
      where: {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      },
      orderBy: { code: "asc" },
    });
    return {
      churchId: pilot.churchId,
      costCenters: rows.map((r) => this.toCostCenterDto(r)),
    };
  }

  async createCostCenter(
    actor: AuthUser,
    input: { code: string; name: string },
  ) {
    const pilot = await this.requireFinance(actor);
    const code = input.code?.trim();
    const name = input.name?.trim();
    if (!code || !name) {
      throw new BadRequestException("code e name são obrigatórios");
    }
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.costCenter.findUnique({
        where: { churchId_code: { churchId: pilot.churchId, code } },
      });
      if (existing) {
        throw new ConflictException({
          code: "COST_CENTER_CODE_EXISTS",
          message: "Código de centro de custo já existe",
        });
      }
      const row = await tx.costCenter.create({
        data: {
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          code,
          name,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "ledger.cost_center.create",
          resourceType: "cost_center",
          resourceId: row.id,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: { code },
        },
      });
      return this.toCostCenterDto(row);
    });
  }

  async patchCostCenter(
    actor: AuthUser,
    costCenterId: string,
    input: { name?: string; active?: boolean },
  ) {
    const pilot = await this.requireFinance(actor);
    await this.requireCostCenterInPilot(pilot, costCenterId);
    const row = await this.prisma.costCenter.update({
      where: { id: costCenterId },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
    });
    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.userId,
        action: "ledger.cost_center.patch",
        resourceType: "cost_center",
        resourceId: row.id,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        metadata: { active: row.active },
      },
    });
    return this.toCostCenterDto(row);
  }

  // —— Orçamento + competência (RF-019) ——

  async listBudgets(actor: AuthUser, year?: number) {
    const pilot = await this.requireFinance(actor);
    const rows = await this.prisma.budget.findMany({
      where: {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        ...(year ? { year } : {}),
      },
      orderBy: [{ year: "desc" }, { title: "asc" }],
      include: { lines: true },
    });
    return {
      churchId: pilot.churchId,
      budgets: rows.map((r) => this.toBudgetDto(r)),
    };
  }

  async createBudget(
    actor: AuthUser,
    input: { year: number; title: string; notes?: string },
  ) {
    const pilot = await this.requireFinance(actor);
    const title = input.title?.trim();
    if (!title || !Number.isInteger(input.year)) {
      throw new BadRequestException("year e title são obrigatórios");
    }
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.budget.findUnique({
        where: {
          churchId_year_title: {
            churchId: pilot.churchId,
            year: input.year,
            title,
          },
        },
      });
      if (existing) {
        throw new ConflictException({
          code: "BUDGET_EXISTS",
          message: "Orçamento com mesmo year+title já existe",
        });
      }
      const row = await tx.budget.create({
        data: {
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          year: input.year,
          title,
          notes: input.notes?.trim() || null,
          createdByUserId: actor.userId,
        },
        include: { lines: true },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "ledger.budget.create",
          resourceType: "budget",
          resourceId: row.id,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: { year: row.year, title },
        },
      });
      return this.toBudgetDto(row);
    });
  }

  async getBudget(actor: AuthUser, budgetId: string) {
    const pilot = await this.requireFinance(actor);
    const row = await this.requireBudgetInPilot(pilot, budgetId);
    return this.toBudgetDto(row);
  }

  async patchBudget(
    actor: AuthUser,
    budgetId: string,
    input: { status?: string; notes?: string | null },
  ) {
    const pilot = await this.requireFinance(actor);
    const current = await this.requireBudgetInPilot(pilot, budgetId);
    let status: BudgetStatusCode | undefined;
    if (input.status !== undefined) {
      if (!BUDGET_STATUSES.includes(input.status as BudgetStatusCode)) {
        throw new BadRequestException("status de orçamento inválido");
      }
      status = input.status as BudgetStatusCode;
      if (current.status === "CLOSED" && status !== "CLOSED") {
        throw new ConflictException({
          code: "BUDGET_ALREADY_CLOSED",
          message: "Orçamento CLOSED não reabre nesta fatia",
        });
      }
    }
    const row = await this.prisma.budget.update({
      where: { id: budgetId },
      data: {
        ...(status ? { status } : {}),
        ...(input.notes !== undefined
          ? { notes: input.notes?.trim() || null }
          : {}),
      },
      include: { lines: true },
    });
    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.userId,
        action: "ledger.budget.patch",
        resourceType: "budget",
        resourceId: row.id,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        metadata: { status: row.status },
      },
    });
    return this.toBudgetDto(row);
  }

  async addBudgetLine(
    actor: AuthUser,
    budgetId: string,
    input: {
      accountId: string;
      plannedCents: number;
      fundId?: string;
      costCenterId?: string;
      notes?: string;
    },
  ) {
    const pilot = await this.requireFinance(actor);
    const budget = await this.requireBudgetInPilot(pilot, budgetId);
    if (budget.status === "CLOSED") {
      throw new ConflictException({
        code: "BUDGET_CLOSED",
        message: "Não é possível adicionar linhas a orçamento CLOSED",
      });
    }
    if (!Number.isInteger(input.plannedCents) || input.plannedCents < 0) {
      throw new BadRequestException("plannedCents deve ser ≥ 0");
    }
    await this.requireAccountInPilot(pilot, input.accountId);
    let fundId: string | null = null;
    let costCenterId: string | null = null;
    if (input.fundId) {
      fundId = (await this.requireFundInPilot(pilot, input.fundId)).id;
    }
    if (input.costCenterId) {
      costCenterId = (
        await this.requireCostCenterInPilot(pilot, input.costCenterId)
      ).id;
    }
    const line = await this.prisma.budgetLine.create({
      data: {
        budgetId,
        accountId: input.accountId,
        plannedCents: input.plannedCents,
        fundId,
        costCenterId,
        notes: input.notes?.trim() || null,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.userId,
        action: "ledger.budget.line_add",
        resourceType: "budget_line",
        resourceId: line.id,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        metadata: { budgetId, plannedCents: line.plannedCents },
      },
    });
    const refreshed = await this.requireBudgetInPilot(pilot, budgetId);
    return this.toBudgetDto(refreshed);
  }

  async listPeriods(actor: AuthUser) {
    const pilot = await this.requireFinance(actor);
    const rows = await this.prisma.accountingPeriod.findMany({
      where: {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      },
      orderBy: [{ year: "desc" }, { month: "desc" }],
    });
    return {
      churchId: pilot.churchId,
      periods: rows.map((r) => this.toPeriodDto(r)),
    };
  }

  async openPeriod(
    actor: AuthUser,
    input: { year: number; month: number; notes?: string },
  ) {
    const pilot = await this.requireFinance(actor);
    if (!isValidCompetence(input.year, input.month)) {
      throw new BadRequestException("year/month inválidos");
    }
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.accountingPeriod.findUnique({
        where: {
          churchId_year_month: {
            churchId: pilot.churchId,
            year: input.year,
            month: input.month,
          },
        },
      });
      if (existing) {
        throw new ConflictException({
          code: "PERIOD_EXISTS",
          message: "Período de competência já existe",
        });
      }
      const row = await tx.accountingPeriod.create({
        data: {
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          year: input.year,
          month: input.month,
          status: "OPEN",
          notes: input.notes?.trim() || null,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "ledger.period.open",
          resourceType: "accounting_period",
          resourceId: row.id,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: { year: row.year, month: row.month },
        },
      });
      return this.toPeriodDto(row);
    });
  }

  async closePeriod(actor: AuthUser, periodId: string) {
    const pilot = await this.requireFinance(actor);
    const row = await this.requirePeriodInPilot(pilot, periodId);
    if (row.status === "CLOSED") {
      throw new ConflictException({
        code: "PERIOD_ALREADY_CLOSED",
        message: "Período já fechado",
      });
    }
    const updated = await this.prisma.accountingPeriod.update({
      where: { id: periodId },
      data: {
        status: "CLOSED",
        closedAt: new Date(),
        closedByUserId: actor.userId,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.userId,
        action: "ledger.period.close",
        resourceType: "accounting_period",
        resourceId: periodId,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        metadata: { year: updated.year, month: updated.month },
      },
    });
    return this.toPeriodDto(updated);
  }

  // —— Comprovantes / anexos (RF-016) ——

  async listAttachments(actor: AuthUser, entryId: string) {
    const pilot = await this.requireFinance(actor);
    await this.requireEntryInPilot(pilot, entryId);
    const rows = await this.prisma.ledgerEntryAttachment.findMany({
      where: {
        entryId,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      },
      orderBy: { createdAt: "desc" },
    });
    return {
      entryId,
      attachments: rows.map((r) => this.toAttachmentMeta(r)),
    };
  }

  async uploadAttachment(
    actor: AuthUser,
    entryId: string,
    file: {
      originalname: string;
      mimetype: string;
      buffer: Buffer;
      size: number;
    },
  ) {
    const pilot = await this.requireFinance(actor);
    await this.requireEntryInPilot(pilot, entryId);
    if (!ATTACHMENT_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        "Tipo não permitido — use PDF, JPEG ou PNG",
      );
    }
    if (file.size <= 0 || file.size > ATTACHMENT_MAX_BYTES) {
      throw new BadRequestException("Arquivo deve ter entre 1 byte e 5 MiB");
    }
    const displayName = sanitizeDisplayName(file.originalname);
    const ext =
      file.mimetype === "application/pdf"
        ? "pdf"
        : file.mimetype === "image/png"
          ? "png"
          : "jpg";
    const storageKey = this.storage.buildLedgerAttachmentKey({
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      entryId,
      extension: ext,
    });
    await this.storage.put(storageKey, file.buffer);
    const sha256 = this.storage.contentSha256(file.buffer);
    const row = await this.prisma.ledgerEntryAttachment.create({
      data: {
        entryId,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        uploadedByUserId: actor.userId,
        displayName,
        contentType: file.mimetype,
        byteSize: file.size,
        storageKey,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.userId,
        action: "ledger.attachment.upload",
        resourceType: "ledger_entry_attachment",
        resourceId: row.id,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        metadata: {
          entryId,
          contentType: file.mimetype,
          byteSize: file.size,
          sha256,
        },
      },
    });
    return this.toAttachmentMeta(row);
  }

  async downloadAttachment(
    actor: AuthUser,
    entryId: string,
    attachmentId: string,
  ) {
    const pilot = await this.requireFinance(actor);
    await this.requireEntryInPilot(pilot, entryId);
    const row = await this.prisma.ledgerEntryAttachment.findFirst({
      where: {
        id: attachmentId,
        entryId,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      },
    });
    if (!row) {
      throw new NotFoundException("Anexo não encontrado");
    }
    const bytes = await this.storage.get(row.storageKey);
    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.userId,
        action: "ledger.attachment.download",
        resourceType: "ledger_entry_attachment",
        resourceId: row.id,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        metadata: { entryId },
      },
    });
    return {
      bytes,
      contentType: row.contentType,
      displayName: row.displayName,
    };
  }

  async removeAttachment(
    actor: AuthUser,
    entryId: string,
    attachmentId: string,
  ) {
    const pilot = await this.requireFinance(actor);
    await this.requireEntryInPilot(pilot, entryId);
    const row = await this.prisma.ledgerEntryAttachment.findFirst({
      where: {
        id: attachmentId,
        entryId,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      },
    });
    if (!row) {
      throw new NotFoundException("Anexo não encontrado");
    }
    await this.prisma.ledgerEntryAttachment.delete({ where: { id: row.id } });
    await this.storage.remove(row.storageKey);
    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.userId,
        action: "ledger.attachment.delete",
        resourceType: "ledger_entry_attachment",
        resourceId: row.id,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        metadata: { entryId, contentType: row.contentType },
      },
    });
    return { deleted: true as const, id: row.id, entryId };
  }

  // —— helpers ——

  private async requireFinance(actor: AuthUser, action: "read" | "write" = "write"): Promise<PilotScope> {
    const pilot = await this.pilot.getPilotChurch();
    const scope = { organizationId: pilot.organizationId, churchId: pilot.churchId };
    const adminRead = action === "read" && hasAccess(actor.grants, { ...scope, roleCodes: [ROLE_CODES.PLATFORM_ADMIN] });
    if (!adminRead && !canAccessFinance(actor.grants, scope)) {
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

  private async requireBankLineInPilot(pilot: PilotScope, lineId: string) {
    const row = await this.prisma.bankStatementLine.findFirst({
      where: { id: lineId },
      include: {
        batch: {
          select: {
            id: true,
            organizationId: true,
            churchId: true,
          },
        },
      },
    });
    if (
      !row ||
      row.batch.organizationId !== pilot.organizationId ||
      row.batch.churchId !== pilot.churchId
    ) {
      throw new NotFoundException("Linha de extrato não encontrada");
    }
    return row;
  }

  private async requireFundInPilot(pilot: PilotScope, fundId: string) {
    const row = await this.prisma.fund.findFirst({
      where: {
        id: fundId,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      },
    });
    if (!row) {
      throw new NotFoundException("Fundo não encontrado");
    }
    return row;
  }

  private async requireCostCenterInPilot(
    pilot: PilotScope,
    costCenterId: string,
  ) {
    const row = await this.prisma.costCenter.findFirst({
      where: {
        id: costCenterId,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      },
    });
    if (!row) {
      throw new NotFoundException("Centro de custo não encontrado");
    }
    return row;
  }

  private async requireBudgetInPilot(pilot: PilotScope, budgetId: string) {
    const row = await this.prisma.budget.findFirst({
      where: {
        id: budgetId,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      },
      include: { lines: true },
    });
    if (!row) {
      throw new NotFoundException("Orçamento não encontrado");
    }
    return row;
  }

  private async requirePeriodInPilot(pilot: PilotScope, periodId: string) {
    const row = await this.prisma.accountingPeriod.findFirst({
      where: {
        id: periodId,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      },
    });
    if (!row) {
      throw new NotFoundException("Período contábil não encontrado");
    }
    return row;
  }

  /** Bloqueia criação se existir período CLOSED para a competência. */
  private async assertPeriodOpen(
    pilot: PilotScope,
    year: number,
    month: number,
  ) {
    const closed = await this.prisma.accountingPeriod.findFirst({
      where: {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        year,
        month,
        status: "CLOSED",
      },
    });
    if (closed) {
      throw new ConflictException({
        code: "ACCOUNTING_PERIOD_CLOSED",
        message: `Competência ${year}-${String(month).padStart(2, "0")} fechada`,
      });
    }
  }

  private toBankLineDto(row: {
    id: string;
    batchId: string;
    postedAt: Date;
    amountCents: number;
    description: string;
    externalRef: string | null;
    matchStatus: string;
    matchedEntryId: string | null;
    createdAt: Date;
  }) {
    return {
      id: row.id,
      batchId: row.batchId,
      postedAt: row.postedAt.toISOString(),
      amountCents: row.amountCents,
      description: row.description,
      externalRef: row.externalRef,
      matchStatus: row.matchStatus,
      matchedEntryId: row.matchedEntryId,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toAccountDto(row: {
    id: string;
    churchId: string;
    code: string;
    name: string;
    type: string;
    parentId: string | null;
    costCenter: string | null;
    costCenterId?: string | null;
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
      costCenterId: row.costCenterId ?? null,
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
    fundId?: string | null;
    costCenterId?: string | null;
    competenceYear?: number | null;
    competenceMonth?: number | null;
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
      fundId: row.fundId ?? null,
      costCenterId: row.costCenterId ?? null,
      competenceYear: row.competenceYear ?? null,
      competenceMonth: row.competenceMonth ?? null,
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
    adapter?: string;
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
      adapter: row.adapter ?? "FILE",
      filename: row.filename,
      stubNote: row.stubNote,
      lineCount: row.lineCount,
      createdByUserId: row.createdByUserId,
      liveBankApi: false as const,
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

  private toFundDto(row: {
    id: string;
    churchId: string;
    code: string;
    name: string;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      churchId: row.churchId,
      code: row.code,
      name: row.name,
      active: row.active,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toCostCenterDto(row: {
    id: string;
    churchId: string;
    code: string;
    name: string;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      churchId: row.churchId,
      code: row.code,
      name: row.name,
      active: row.active,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toBudgetDto(row: {
    id: string;
    churchId: string;
    year: number;
    title: string;
    status: string;
    notes: string | null;
    createdByUserId: string;
    createdAt: Date;
    updatedAt: Date;
    lines: Array<{
      id: string;
      accountId: string;
      fundId: string | null;
      costCenterId: string | null;
      plannedCents: number;
      notes: string | null;
    }>;
  }) {
    return {
      id: row.id,
      churchId: row.churchId,
      year: row.year,
      title: row.title,
      status: row.status,
      notes: row.notes,
      createdByUserId: row.createdByUserId,
      lines: row.lines.map((l) => ({
        id: l.id,
        accountId: l.accountId,
        fundId: l.fundId,
        costCenterId: l.costCenterId,
        plannedCents: l.plannedCents,
        notes: l.notes,
      })),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toPeriodDto(row: {
    id: string;
    churchId: string;
    year: number;
    month: number;
    status: string;
    closedAt: Date | null;
    closedByUserId: string | null;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      churchId: row.churchId,
      year: row.year,
      month: row.month,
      status: row.status,
      closedAt: row.closedAt?.toISOString() ?? null,
      closedByUserId: row.closedByUserId,
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toAttachmentMeta(row: {
    id: string;
    entryId: string;
    displayName: string;
    contentType: string;
    byteSize: number;
    createdAt: Date;
    uploadedByUserId: string;
  }) {
    return {
      id: row.id,
      entryId: row.entryId,
      displayName: row.displayName,
      contentType: row.contentType,
      byteSize: row.byteSize,
      uploadedByUserId: row.uploadedByUserId,
      createdAt: row.createdAt.toISOString(),
      // storageKey nunca exposto ao FE
    };
  }
}

function sanitizeDisplayName(name: string): string {
  const base = name.split(/[/\\]/).pop()?.trim() || "anexo";
  return base.replace(/[^\w.\- ()[\]]+/g, "_").slice(0, 180) || "anexo";
}
