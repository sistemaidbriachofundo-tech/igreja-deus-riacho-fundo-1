import { ConflictException, ForbiddenException, Injectable } from "@nestjs/common";
import { hasAccess, ROLE_CODES } from "@idbrf/shared";
import type { AuthUser } from "../auth/types/auth-user";
import { BusinessException } from "../common/business.exception";
import { normalizeAccountPhone } from "../account/account-phone";
import { PrismaService } from "../prisma/prisma.service";
import { PilotService } from "../pilot/pilot.service";

const STAFF = [
  ROLE_CODES.SECRETARIA,
  ROLE_CODES.PASTOR,
  ROLE_CODES.LIDER_MINISTERIO,
  ROLE_CODES.TESOURARIA,
  ROLE_CODES.PLATFORM_ADMIN,
] as const;

const EMAIL_KEY = /^[a-z0-9._+-]{1,64}@example\.test$/;
const EVP_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertPilotPixKey(value: string): string {
  const key = value.trim();
  if (EMAIL_KEY.test(key.toLowerCase())) return key.toLowerCase();
  if (EVP_KEY.test(key)) return key.toLowerCase();
  try {
    const phone = normalizeAccountPhone(key);
    if (phone) return phone;
  } catch {
    // A chave não é telefone de teste.
  }
  throw new BusinessException(
    "No piloto a chave Pix é um e-mail @example.test, um EVP ou um telefone de teste.",
    "PIX_KEY_NOT_ALLOWED",
    400,
  );
}

export function isChurchBankAccount(account: { type: string; code: string; active: boolean }): boolean {
  return account.active && account.type === "ASSET" && /^1\.1(\.|$)/.test(account.code);
}

@Injectable()
export class ReceivingAccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pilot: PilotService,
  ) {}

  async create(
    actor: AuthUser,
    input: { ledgerAccountId: string; displayName: string; pixKey: string; merchantCity?: string | null },
  ) {
    const pilot = await this.scope(actor, [ROLE_CODES.TESOURARIA]);
    const ledger = await this.prisma.ledgerAccount.findFirst({
      where: {
        id: input.ledgerAccountId,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      },
    });
    if (!ledger || !isChurchBankAccount(ledger)) {
      throw new BusinessException(
        "Selecione uma conta bancária ativa da igreja.",
        "RECEIVING_ACCOUNT_INVALID",
        400,
      );
    }
    const displayName = input.displayName.trim().replace(/\s+/g, " ");
    if (displayName.length < 2 || displayName.length > 80) {
      throw new BusinessException("Informe o nome da conta como ele aparece para a igreja.", "RECEIVING_ACCOUNT_INVALID", 400);
    }
    const pixKey = assertPilotPixKey(input.pixKey);
    const merchantCity = (input.merchantCity ?? "Brasilia").trim() || "Brasilia";
    try {
      const row = await this.prisma.churchReceivingAccount.create({
        data: {
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          ledgerAccountId: ledger.id,
          displayName,
          pixKey,
          merchantCity,
        },
        select: { id: true, displayName: true, ledgerAccountId: true, active: true },
      });
      await this.prisma.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "finance.receiving_account.create",
          resourceType: "church_receiving_account",
          resourceId: row.id,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: { ledgerAccountId: ledger.id, ledgerCode: ledger.code },
        },
      });
      return { ...row, ledgerCode: ledger.code };
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
        throw new ConflictException("Esta conta da igreja já recebe Pix.");
      }
      throw error;
    }
  }

  async enableMercadoPago(actor: AuthUser, accountId: string, input: { enabled: boolean; collectorId?: string | null }) {
    const pilot = await this.scope(actor, [ROLE_CODES.TESOURARIA]);
    const collectorId = input.collectorId?.trim() || null;
    if (input.enabled && collectorId && !/^[A-Za-z0-9_-]{1,64}$/.test(collectorId)) {
      throw new BusinessException("O identificador do recebedor é inválido.", "MERCADO_PAGO_COLLECTOR_INVALID", 400);
    }
    const updated = await this.prisma.churchReceivingAccount.updateMany({
      where: { id: accountId, organizationId: pilot.organizationId, churchId: pilot.churchId, active: true },
      data: { mercadoPagoEnabled: input.enabled, mercadoPagoCollectorId: input.enabled ? collectorId : null },
    });
    if (!updated.count) throw new BusinessException("Conta de recebimento não encontrada.", "RECEIVING_ACCOUNT_INVALID", 404);
    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.userId, action: "finance.receiving_account.mercado_pago",
        resourceType: "church_receiving_account", resourceId: accountId,
        organizationId: pilot.organizationId, churchId: pilot.churchId,
        metadata: { enabled: input.enabled },
      },
    });
    return { id: accountId, mercadoPagoEnabled: input.enabled, mercadoPagoCollectorId: input.enabled ? collectorId : null };
  }

  /** Lista para o cadastrador escolher. A chave Pix e as credenciais do provedor não saem nesta resposta. */
  async listForEvents(actor: AuthUser) {
    const pilot = await this.scope(actor, STAFF);
    const rows = await this.prisma.churchReceivingAccount.findMany({
      where: { organizationId: pilot.organizationId, churchId: pilot.churchId, active: true, ledgerAccount: { active: true } },
      orderBy: { displayName: "asc" },
      select: {
        id: true,
        displayName: true,
        ledgerAccountId: true,
        active: true,
        mercadoPagoEnabled: true,
        mercadoPagoCollectorId: true,
        ledgerAccount: { select: { code: true, name: true } },
      },
    });
    return {
      accounts: rows.map((row) => ({
        id: row.id,
        displayName: row.displayName,
        ledgerAccountId: row.ledgerAccountId,
        ledgerCode: row.ledgerAccount.code,
        ledgerName: row.ledgerAccount.name,
        active: row.active,
        mercadoPagoEnabled: row.mercadoPagoEnabled,
        mercadoPagoCollectorId: row.mercadoPagoCollectorId,
      })),
    };
  }

  private async scope(actor: AuthUser, roles: readonly string[]) {
    const pilot = await this.pilot.getPilotChurch();
    if (
      !hasAccess(actor.grants, {
        roleCodes: [...roles],
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      }) ||
      (actor.churchId && actor.churchId !== pilot.churchId) ||
      (actor.organizationId && actor.organizationId !== pilot.organizationId)
    ) {
      throw new ForbiddenException("Sem permissão para as contas desta congregação.");
    }
    return pilot;
  }
}
