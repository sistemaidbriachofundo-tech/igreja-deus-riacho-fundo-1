import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { canAccessFinance } from "@idbrf/shared";
import type { AuthUser } from "../auth/types/auth-user";
import { FinanceService } from "../finance/finance.service";
import { PilotService } from "../pilot/pilot.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  TREASURY_BLOCKED,
  assertIdempotencyKey,
  buildCashReceiptLines,
  buildCommitmentLines,
  buildReceivableLines,
  buildSettlementLines,
  classifyAccount,
  projectTreasuryPosition,
  type AccountLiquidityRole,
  type PositionEntry,
  type TreasuryLine,
  type TreasuryPostingKind,
} from "./treasury-position";

const IDEMPOTENCY_ACTION = "treasury.idempotency";

type PilotScope = { organizationId: string; churchId: string };

interface AccountRow {
  id: string;
  code: string;
  type: string;
  active: boolean;
}

export interface TreasuryPostResult {
  idempotentReplay: boolean;
  kind: TreasuryPostingKind;
  countsTowardPosition: boolean;
  reason: "DRAFT_AWAITING_DUAL_APPROVAL" | "APPROVED";
  entry: { id: string; status: string };
  blocked: typeof TREASURY_BLOCKED;
}

@Injectable()
export class TreasuryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pilot: PilotService,
    private readonly finance: FinanceService,
  ) {}

  async position(actor: AuthUser, costCenterId?: string) {
    const scope = await this.requireTreasury(actor);
    const rows = await this.prisma.ledgerEntry.findMany({
      where: {
        organizationId: scope.organizationId,
        churchId: scope.churchId,
      },
      orderBy: [{ entryDate: "asc" }, { createdAt: "asc" }],
      include: { lines: { include: { account: true } } },
    });
    const entries: PositionEntry[] = rows.map((row) => ({
      id: row.id,
      status: row.status,
      costCenterId: row.costCenterId,
      lines: row.lines.map((item) => ({
        side: item.side === "CREDIT" ? "CREDIT" : "DEBIT",
        amountCents: item.amountCents,
        accountType: item.account.type,
        accountCode: item.account.code,
      })),
    }));

    let position;
    try {
      position = projectTreasuryPosition(entries, { costCenterId });
    } catch (error) {
      throw new BadRequestException({
        code: error instanceof Error ? error.message : "POSITION_INVALID",
        message: "Posição recusou um lançamento inconsistente",
      });
    }

    return {
      churchId: scope.churchId,
      liveBankApis: false as const,
      blocked: TREASURY_BLOCKED,
      position,
    };
  }

  postCashReceipt(
    actor: AuthUser,
    input: {
      idempotencyKey: string;
      entryDate: string;
      description: string;
      cashAccountId: string;
      revenueAccountId: string;
      grossCents: number;
      feeCents?: number;
      feeAccountId?: string;
      costCenterId?: string;
      fundId?: string;
    },
  ) {
    return this.post(actor, "CASH_RECEIPT", input.idempotencyKey, input, async () => {
      const lines = this.linesOrThrow(() => buildCashReceiptLines(input));
      const accounts = await this.loadAccounts(actor, lines.map((item) => item.accountId));
      this.expectRole(accounts, input.cashAccountId, "CASH");
      this.expectRole(accounts, input.revenueAccountId, "REVENUE");
      if ((input.feeCents ?? 0) > 0 && input.feeAccountId) {
        this.expectRole(accounts, input.feeAccountId, "FEE");
      }
      return lines;
    });
  }

  postReceivable(
    actor: AuthUser,
    input: {
      idempotencyKey: string;
      entryDate: string;
      description: string;
      receivableAccountId: string;
      revenueAccountId: string;
      grossCents: number;
      costCenterId?: string;
      fundId?: string;
    },
  ) {
    return this.post(actor, "RECEIVABLE", input.idempotencyKey, input, async () => {
      const lines = this.linesOrThrow(() => buildReceivableLines(input));
      const accounts = await this.loadAccounts(actor, lines.map((item) => item.accountId));
      this.expectRole(accounts, input.receivableAccountId, "RECEIVABLE");
      this.expectRole(accounts, input.revenueAccountId, "REVENUE");
      return lines;
    });
  }

  postCommitment(
    actor: AuthUser,
    input: {
      idempotencyKey: string;
      entryDate: string;
      description: string;
      expenseAccountId: string;
      payableAccountId: string;
      amountCents: number;
      costCenterId?: string;
      fundId?: string;
    },
  ) {
    return this.post(actor, "COMMITMENT", input.idempotencyKey, input, async () => {
      const lines = this.linesOrThrow(() =>
        buildCommitmentLines({
          expenseAccountId: input.expenseAccountId,
          payableAccountId: input.payableAccountId,
          amountCents: input.amountCents,
        }),
      );
      const accounts = await this.loadAccounts(actor, lines.map((item) => item.accountId));
      this.expectRole(accounts, input.expenseAccountId, "EXPENSE");
      this.expectRole(accounts, input.payableAccountId, "PAYABLE");
      return lines;
    });
  }

  postSettlement(
    actor: AuthUser,
    input: {
      idempotencyKey: string;
      entryDate: string;
      description: string;
      payableAccountId: string;
      cashAccountId: string;
      amountCents: number;
      costCenterId?: string;
      fundId?: string;
    },
  ) {
    return this.post(actor, "SETTLEMENT", input.idempotencyKey, input, async () => {
      const lines = this.linesOrThrow(() =>
        buildSettlementLines({
          payableAccountId: input.payableAccountId,
          cashAccountId: input.cashAccountId,
          amountCents: input.amountCents,
        }),
      );
      const accounts = await this.loadAccounts(actor, lines.map((item) => item.accountId));
      this.expectRole(accounts, input.payableAccountId, "PAYABLE");
      this.expectRole(accounts, input.cashAccountId, "CASH");
      return lines;
    });
  }

  private async post(
    actor: AuthUser,
    kind: TreasuryPostingKind,
    rawKey: string,
    input: {
      entryDate: string;
      description: string;
      costCenterId?: string;
      fundId?: string;
    },
    build: () => Promise<TreasuryLine[]>,
  ): Promise<TreasuryPostResult> {
    const scope = await this.requireTreasury(actor);
    const key = this.keyOrThrow(rawKey);
    const description = input.description?.trim() ?? "";
    if (description.length < 4 || description.length > 180) {
      throw new BadRequestException({
        code: "INVALID_DESCRIPTION",
        message: "Descrição sintética deve ter entre 4 e 180 caracteres",
      });
    }

    const existing = await this.findIntent(scope, key);
    if (existing) {
      if (existing.kind !== kind) {
        throw new ConflictException({
          code: "IDEMPOTENCY_KIND_MISMATCH",
          message: "A chave já foi usada em outro tipo de lançamento",
        });
      }
      try {
        const entry = await this.finance.getEntry(actor, existing.entryId);
        return this.draftResult(kind, true, entry);
      } catch (error) {
        if (error instanceof NotFoundException) {
          throw new ConflictException({
            code: "IDEMPOTENCY_ORPHAN",
            message: "A chave aponta para um lançamento que não está mais no escopo",
          });
        }
        throw error;
      }
    }

    const lines = await build();
    const entry = await this.finance.createEntry(actor, {
      entryDate: input.entryDate,
      description,
      lines,
      costCenterId: input.costCenterId,
      fundId: input.fundId,
    });

    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.userId,
        action: IDEMPOTENCY_ACTION,
        resourceType: "ledger_entry",
        resourceId: entry.id,
        organizationId: scope.organizationId,
        churchId: scope.churchId,
        metadata: { idempotencyKey: key, entryId: entry.id, kind },
      },
    });

    return this.draftResult(kind, false, entry);
  }

  private draftResult(
    kind: TreasuryPostingKind,
    idempotentReplay: boolean,
    entry: { id: string; status: string },
  ): TreasuryPostResult {
    const approved = entry.status === "APPROVED";
    return {
      idempotentReplay,
      kind,
      countsTowardPosition: approved,
      reason: approved ? "APPROVED" : "DRAFT_AWAITING_DUAL_APPROVAL",
      entry: { id: entry.id, status: entry.status },
      blocked: TREASURY_BLOCKED,
    };
  }

  private async findIntent(
    scope: PilotScope,
    key: string,
  ): Promise<{ entryId: string; kind: string } | null> {
    const row = await this.prisma.auditLog.findFirst({
      where: {
        action: IDEMPOTENCY_ACTION,
        organizationId: scope.organizationId,
        churchId: scope.churchId,
        metadata: { path: ["idempotencyKey"], equals: key },
      },
      orderBy: { createdAt: "asc" },
    });
    if (!row?.metadata || typeof row.metadata !== "object" || Array.isArray(row.metadata)) {
      return null;
    }
    const metadata = row.metadata as { entryId?: unknown; kind?: unknown };
    if (typeof metadata.entryId !== "string" || typeof metadata.kind !== "string") {
      return null;
    }
    return { entryId: metadata.entryId, kind: metadata.kind };
  }

  private async loadAccounts(actor: AuthUser, ids: string[]): Promise<Map<string, AccountRow>> {
    const scope = await this.requireTreasury(actor);
    const unique = [...new Set(ids)];
    const rows = await this.prisma.ledgerAccount.findMany({
      where: {
        id: { in: unique },
        organizationId: scope.organizationId,
        churchId: scope.churchId,
        active: true,
      },
    });
    if (rows.length !== unique.length) {
      throw new BadRequestException({
        code: "ACCOUNT_OUT_OF_SCOPE",
        message: "Conta inexistente, inativa ou de outra congregação",
      });
    }
    return new Map(rows.map((row) => [row.id, row]));
  }

  private expectRole(
    accounts: Map<string, AccountRow>,
    accountId: string,
    expected: AccountLiquidityRole,
  ) {
    const account = accounts.get(accountId.trim());
    const actual = account ? classifyAccount(account.type, account.code) : "UNCLASSIFIED";
    if (actual !== expected) {
      throw new BadRequestException({
        code: "ACCOUNT_ROLE_MISMATCH",
        message: "A conta não tem o papel exigido por este lançamento",
        expected,
        actual,
      });
    }
  }

  private async requireTreasury(actor: AuthUser): Promise<PilotScope> {
    const pilot = await this.pilot.getPilotChurch();
    if (
      !canAccessFinance(actor.grants, {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      })
    ) {
      throw new ForbiddenException("Sem permissão de tesouraria nesta congregação");
    }
    return {
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
    };
  }

  private keyOrThrow(value: string): string {
    try {
      return assertIdempotencyKey(value);
    } catch {
      throw new BadRequestException({
        code: "INVALID_IDEMPOTENCY_KEY",
        message: "Chave de idempotência sintética inválida",
      });
    }
  }

  private linesOrThrow(build: () => TreasuryLine[]): TreasuryLine[] {
    try {
      return build();
    } catch (error) {
      throw new BadRequestException({
        code: error instanceof Error ? error.message : "INVALID_LINES",
        message: "Partidas recusadas antes de gravar",
      });
    }
  }
}
