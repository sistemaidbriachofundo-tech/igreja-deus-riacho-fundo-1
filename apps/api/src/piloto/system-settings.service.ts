import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { effectiveSettingValue, isBirthdayTimeZone, parseBrasiliaHour, ROLE_CODES, windowsOverlap, type OperationalScopeKind } from "@idbrf/shared";
import type { AuthUser } from "../auth/types/auth-user";
import { PrismaService } from "../prisma/prisma.service";
import { PilotService } from "../pilot/pilot.service";
import { assertChurchRole } from "./church";

const SCOPE_KINDS = ["PLATFORM", "CHURCH", "MINISTRY", "MODULE", "GROUP", "TRACK"] as const;
type ScopeKind = (typeof SCOPE_KINDS)[number];
const EDITABLE_SETTINGS = new Set([
  "notices.birthday.hour_brasilia",
  "notices.birthday.timezone",
  "pastoral.titular_user_id",
  "pastoral.substitute_user_id",
  "auth.password_reset.ttl_hours",
  "rosters.louvor.week_block",
  "rosters.survey.open_day",
  "events.agenda.keep_days_after_end",
  "secretaria.homonym_warning",
  "service_orders.schedule_conflict",
]);

/** Consumidor real. Chave ausente continua documental até existir wiring. */
const SETTING_CONSUMERS: Record<string, string> = {
  "auth.password_reset.ttl_hours": "access-invitation.service",
  "notices.birthday.hour_brasilia": "birthday-notices.service",
  "notices.birthday.timezone": "birthday-notices.service",
  "events.registration.session_required": "inscrição exige sessão; valor não pode ser afrouxado",
  "events.agenda.keep_days_after_end": "public-portal.controller",
  "finance.mercado_pago.enabled": "pagamento permanece desligado até sandbox autorizado",
  "finance.brb.mode": "somente sonda mock; API live bloqueada",
  "finance.sicoob.mode": "somente sonda mock; API live bloqueada",
  "rosters.louvor.week_block": "personal-roster.service",
  "rosters.survey.open_day": "roster-notices.service",
  "secretaria.homonym_warning": "memberships.service",
  "secretaria.identity_exact": "e-mail ou CPF exato sempre aponta para a ficha; valor não pode ser afrouxado",
  "household.move_requires_confirmation": "mudar de família sempre pede confirmação; valor não pode ser afrouxado",
  "service_orders.schedule_conflict": "service-orders.service",
  "pastoral.titular_user_id": "pastoral-pack.service",
  "pastoral.substitute_user_id": "pastoral-pack.service",
};
/** Regras cujo código recusa um valor mais permissivo. Não aparecem como edição ativa. */
const LOCKED_SETTINGS = new Set([
  "events.registration.session_required",
  "finance.mercado_pago.enabled",
  "finance.brb.mode",
  "finance.sicoob.mode",
  "secretaria.identity_exact",
  "household.move_requires_confirmation",
]);

export type SettingBehavior = "active" | "locked" | "documentary";

export function settingBehavior(key: string): SettingBehavior {
  if (LOCKED_SETTINGS.has(key)) return "locked";
  if (EDITABLE_SETTINGS.has(key)) return "active";
  return "documentary";
}

export function clampPasswordResetHours(value: unknown, fallback = 1): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 24 ? value : fallback;
}

@Injectable()
export class SystemSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pilot: PilotService,
  ) {}

  async catalog(actor: AuthUser) {
    await this.admin(actor);
    const items = await this.prisma.systemSettingCatalog.findMany({ orderBy: { key: "asc" } });
    return {
      items: items.map(item => {
        const behavior = settingBehavior(item.key);
        return {
          key: item.key, title: item.title, description: item.description, valueType: item.valueType,
          scopeKind: item.scopeKind, defaultValue: item.defaultJson, devValue: item.devJson,
          editable: behavior === "active", behavior,
          consumer: SETTING_CONSUMERS[item.key] ?? null,
          behaviorNote: behavior === "active"
            ? "A vigência publicada altera o comportamento neste escopo."
            : behavior === "locked"
              ? "Bloqueio de segurança. O valor vigente não pode ser afrouxado."
              : "Documentada. O sistema ainda não usa esta regra.",
        };
      }),
    };
  }

  private pastoralGrants(pilot: { organizationId: string; churchId: string }) {
    return { some: { organizationId: pilot.organizationId, churchId: pilot.churchId, role: { code: ROLE_CODES.PASTOR } } };
  }

  async pastors(actor: AuthUser) {
    const pilot = await this.admin(actor);
    const users = await this.prisma.user.findMany({
      where: { status: "ACTIVE", grants: this.pastoralGrants(pilot) },
      select: { id: true, person: { select: { displayName: true } } },
      orderBy: { person: { displayName: "asc" } },
    });
    return { items: users.map(user => ({ id: user.id, name: user.person.displayName })) };
  }

  async effective(actor: AuthUser, key: string, scopeKind: string, scopeId: string | undefined, at = new Date()) {
    const pilot = await this.admin(actor);
    return this.lookup(pilot, key, scopeKind, scopeId, at);
  }

  async readEffective(actor: AuthUser, key: string, scopeKind: string, scopeId: string | undefined, at = new Date()) {
    const pilot = await this.pilot.getPilotChurch();
    assertChurchRole(actor, pilot, [ROLE_CODES.PLATFORM_ADMIN, ROLE_CODES.SECRETARIA, ROLE_CODES.PASTOR]);
    return this.lookup(pilot, key, scopeKind, scopeId, at);
  }

  /** Regra efetiva da equipe de Louvor. Não afeta outros ministérios. */
  async getLouvorWeekBlock(pilot: { organizationId: string; churchId: string }, ministryId: string, at = new Date()) {
    const row = await this.prisma.ministry.findFirst({
      where: { id: ministryId, organizationId: pilot.organizationId, churchId: pilot.churchId, slug: { startsWith: "louvor" } },
      select: { id: true },
    });
    if (!row) return true;
    const result = await this.lookup(pilot, "rosters.louvor.week_block", "MINISTRY", ministryId, at);
    return typeof result.value === "boolean" ? result.value : true;
  }

  private async validateLouvorScope(pilot: { organizationId: string; churchId: string }, key: string, scopeId?: string | null) {
    if (key !== "rosters.louvor.week_block") return;
    if (!scopeId) throw new BadRequestException("Selecione um ministério de Louvor.");
    const ministry = await this.prisma.ministry.findFirst({
      where: { id: scopeId, organizationId: pilot.organizationId, churchId: pilot.churchId, slug: { startsWith: "louvor" } },
      select: { id: true },
    });
    if (!ministry) throw new BadRequestException("A regra pode ser alterada apenas para um ministério de Louvor desta congregação.");
  }

  async getBirthdayHour(pilot: { organizationId: string; churchId: string }, now: Date) {
    const result = await this.lookup(pilot, "notices.birthday.hour_brasilia", "CHURCH", undefined, now);
    return typeof result.value === "string" ? result.value : "08:00";
  }

  async getBirthdayTimeZone(pilot: { organizationId: string; churchId: string }, now = new Date()) {
    try {
      const result = await this.lookup(pilot, "notices.birthday.timezone", "CHURCH", undefined, now);
      return isBirthdayTimeZone(result.value) ? result.value : "America/Sao_Paulo";
    } catch (error) {
      if (error instanceof NotFoundException) return "America/Sao_Paulo";
      throw error;
    }
  }

  async getSurveyOpenDay(pilot: { organizationId: string; churchId: string }, now = new Date()) {
    return this.readBoundedNumber(pilot, "rosters.survey.open_day", now, 25, 20, 28);
  }

  async getAgendaKeepDays(pilot: { organizationId: string; churchId: string }, now = new Date()) {
    return this.readBoundedNumber(pilot, "events.agenda.keep_days_after_end", now, 0, 0, 14);
  }

  private async readBoundedNumber(
    pilot: { organizationId: string; churchId: string },
    key: string,
    now: Date,
    fallback: number,
    min: number,
    max: number,
  ) {
    try {
      const result = await this.lookup(pilot, key, "CHURCH", undefined, now);
      return typeof result.value === "number" && Number.isInteger(result.value) && result.value >= min && result.value <= max
        ? result.value
        : fallback;
    } catch (error) {
      if (error instanceof NotFoundException) return fallback;
      throw error;
    }
  }

  async pastoralRouting(pilot: { organizationId: string; churchId: string }, now = new Date()) {
    const keys = ["pastoral.titular_user_id", "pastoral.substitute_user_id"];
    const [titular, substitute] = await Promise.all(keys.map(key => this.lookup(pilot, key, "CHURCH", undefined, now)));
    return { titular: typeof titular.value === "string" ? titular.value : "", substitute: typeof substitute.value === "string" ? substitute.value : "" };
  }

  private async lookup(pilot: { organizationId: string; churchId: string }, key: string, scopeKind: string, scopeId: string | undefined, at: Date) {
    const catalog = await this.catalogRow(key);
    const kind = this.scopeKind(scopeKind || catalog.scopeKind);
    const revisions = await this.prisma.systemSettingRevision.findMany({
      where: {
        catalogKey: key, lifecycle: "PUBLISHED", scopeKind: kind, organizationId: pilot.organizationId,
        ...(kind === "CHURCH" || kind === "PLATFORM" ? { churchId: pilot.churchId } : { scopeId: scopeId ?? null }),
      },
    });
    const chosen = effectiveSettingValue({
      devValue: catalog.devJson,
      at: at.toISOString(),
      revisions: revisions.flatMap(revision => revision.effectiveFrom ? [{
        id: revision.id,
        value: revision.valueJson,
        effectiveFrom: revision.effectiveFrom.toISOString(),
        effectiveUntil: revision.effectiveUntil?.toISOString() ?? null,
      }] : []),
    });
    return { key, scopeKind: kind, scopeId: scopeId ?? null, ...chosen, devValue: catalog.devJson };
  }

  async history(actor: AuthUser, key: string) {
    const pilot = await this.admin(actor);
    await this.catalogRow(key);
    const revisions = await this.prisma.systemSettingRevision.findMany({
      where: { catalogKey: key, organizationId: pilot.organizationId, churchId: pilot.churchId },
      orderBy: { createdAt: "asc" },
    });
    return { revisions: revisions.map(revision => this.view(revision)) };
  }

  async draft(actor: AuthUser, input: { key: string; scopeKind?: string; scopeId?: string | null; value: unknown; note?: string | null }) {
    const pilot = await this.admin(actor);
    const catalog = await this.catalogRow(input.key);
    const kind = this.scopeKind(input.scopeKind || catalog.scopeKind);
    await this.validateEdit(pilot, catalog, input.value);
    if (kind !== catalog.scopeKind || ((kind === "CHURCH" || kind === "PLATFORM") && input.scopeId)) {
      throw new BadRequestException("O escopo deve corresponder ao da regra.");
    }
    await this.validateLouvorScope(pilot, input.key, input.scopeId);
    const created = await this.prisma.systemSettingRevision.create({
      data: {
        catalogKey: catalog.key, organizationId: pilot.organizationId, churchId: pilot.churchId,
        scopeKind: kind, scopeId: input.scopeId ?? null, lifecycle: "DRAFT", valueJson: input.value as never,
        draftedByUserId: actor.userId, note: input.note?.slice(0, 280) ?? null, updatedAt: new Date(),
      },
    });
    await this.audit(actor, pilot, "system_setting.draft", created.id, catalog.key);
    return this.view(created);
  }

  private async validateEdit(pilot: { organizationId: string; churchId: string }, catalog: { key: string; valueType: string }, value: unknown) {
    if (LOCKED_SETTINGS.has(catalog.key)) {
      throw new BadRequestException("Bloqueio de segurança. O valor vigente não pode ser afrouxado.");
    }
    if (!EDITABLE_SETTINGS.has(catalog.key)) throw new BadRequestException("Esta regra está disponível para consulta.");
    this.assertValue(catalog.key, catalog.valueType, value);
    if (catalog.key.startsWith("pastoral.") && typeof value === "string" && value) {
      const pastor = await this.prisma.user.findFirst({
        where: { id: value, status: "ACTIVE", grants: this.pastoralGrants(pilot) }, select: { id: true },
      });
      if (!pastor) throw new BadRequestException("Escolha um pastor ativo desta congregação.");
    }
  }

  async editDraft(actor: AuthUser, revisionId: string, value: unknown, expectedUpdatedAt: string) {
    const pilot = await this.admin(actor);
    const current = await this.revision(pilot, revisionId);
    this.expectFresh(current.updatedAt, expectedUpdatedAt);
    if (current.lifecycle !== "DRAFT") throw new ConflictException("Somente rascunhos podem ser editados.");
    await this.validateEdit(pilot, await this.catalogRow(current.catalogKey), value);
    await this.validateLouvorScope(pilot, current.catalogKey, current.scopeId);
    const updated = await this.prisma.$transaction(async tx => {
      const result = await tx.systemSettingRevision.updateMany({
        where: { id: current.id, organizationId: pilot.organizationId, churchId: pilot.churchId, lifecycle: "DRAFT", updatedAt: current.updatedAt },
        data: { valueJson: value as never },
      });
      if (!result.count) throw new ConflictException("A revisão mudou. Atualize a tela.");
      await this.audit(actor, pilot, "system_setting.edit_draft", current.id, current.catalogKey, tx);
      return tx.systemSettingRevision.findUniqueOrThrow({ where: { id: current.id } });
    });
    return this.view(updated);
  }

  async review(actor: AuthUser, revisionId: string, expectedUpdatedAt?: string) {
    const pilot = await this.admin(actor);
    const current = await this.revision(pilot, revisionId);
    this.expectFresh(current.updatedAt, expectedUpdatedAt);
    if (current.lifecycle !== "DRAFT") throw new ConflictException("Somente um rascunho segue para revisão.");
    const updated = await this.prisma.systemSettingRevision.update({
      where: { id: current.id, lifecycle: "DRAFT", updatedAt: current.updatedAt },
      data: { lifecycle: "IN_REVIEW", reviewedByUserId: actor.userId },
    }).catch((error: unknown) => {
      if (error && typeof error === "object" && "code" in error && error.code === "P2025") {
        throw new ConflictException("A revisão mudou. Atualize a tela.");
      }
      throw error;
    });
    await this.audit(actor, pilot, "system_setting.review", updated.id, current.catalogKey);
    return this.view(updated);
  }

  async publish(actor: AuthUser, revisionId: string, input: { effectiveFrom: string; effectiveUntil?: string | null; expectedUpdatedAt?: string; replaceRevisionId?: string }) {
    const pilot = await this.admin(actor);
    const current = await this.revision(pilot, revisionId);
    this.expectFresh(current.updatedAt, input.expectedUpdatedAt);
    if (current.lifecycle !== "IN_REVIEW") throw new ConflictException("A publicação sai da revisão.");
    await this.validateLouvorScope(pilot, current.catalogKey, current.scopeId);
    const now = new Date();
    const from = input.effectiveFrom === "now" ? now : this.instant(input.effectiveFrom, "effectiveFrom");
    const until = input.effectiveUntil ? this.instant(input.effectiveUntil, "effectiveUntil") : null;
    if (until && until <= from) throw new BadRequestException("A vigência termina depois do início.");
    const updated = await this.prisma.$transaction(async tx => {
      const fresh = await tx.systemSettingRevision.findFirst({ where: { id: current.id, organizationId: pilot.organizationId, churchId: pilot.churchId } });
      if (!fresh) throw new NotFoundException("Revisão não encontrada.");
      this.expectFresh(fresh.updatedAt, input.expectedUpdatedAt);
      if (fresh.lifecycle !== "IN_REVIEW" || fresh.scopeKind !== current.scopeKind || fresh.scopeId !== current.scopeId) {
        throw new ConflictException("A publicação sai da revisão deste escopo.");
      }
      const published = await tx.systemSettingRevision.findMany({
        where: {
          catalogKey: fresh.catalogKey, lifecycle: "PUBLISHED", scopeKind: fresh.scopeKind,
          scopeId: fresh.scopeId, organizationId: pilot.organizationId, churchId: pilot.churchId, id: { not: fresh.id },
        },
      });
      const overlaps = published.filter(revision => revision.effectiveFrom && windowsOverlap(
        { from: from.toISOString(), until: until?.toISOString() ?? null },
        { from: revision.effectiveFrom.toISOString(), until: revision.effectiveUntil?.toISOString() ?? null },
      ));
      if (input.replaceRevisionId) {
        const previous = overlaps[0];
        if (overlaps.length !== 1 || previous.id !== input.replaceRevisionId || !previous.effectiveFrom ||
            previous.effectiveFrom > now || previous.effectiveFrom >= from || previous.effectiveUntil || from < now) {
          throw new ConflictException("A vigência mudou ou há uma publicação agendada neste período. Confira o histórico.");
        }
        await tx.systemSettingRevision.update({ where: { id: previous.id }, data: { effectiveUntil: from } });
      } else if (overlaps.length) {
        throw new ConflictException("Já existe vigência publicada para este escopo.");
      }
      const devBefore = await tx.systemSettingCatalog.findUnique({ where: { key: fresh.catalogKey }, select: { devJson: true } });
      const row = await tx.systemSettingRevision.update({
        where: { id: fresh.id },
        data: { lifecycle: "PUBLISHED", effectiveFrom: from, effectiveUntil: until, publishedByUserId: actor.userId },
      });
      const devAfter = await tx.systemSettingCatalog.findUnique({ where: { key: fresh.catalogKey }, select: { devJson: true } });
      if (JSON.stringify(devBefore?.devJson) !== JSON.stringify(devAfter?.devJson)) {
        throw new ConflictException("O valor de DEV não pode ser alterado pela publicação.");
      }
      return row;
    }, { isolationLevel: "Serializable" });
    await this.audit(actor, pilot, "system_setting.publish", updated.id, current.catalogKey);
    return this.view(updated);
  }

  private async admin(actor: AuthUser) {
    const pilot = await this.pilot.getPilotChurch();
    assertChurchRole(actor, pilot, [ROLE_CODES.PLATFORM_ADMIN]);
    return pilot;
  }

  private async catalogRow(key: string) {
    const row = await this.prisma.systemSettingCatalog.findUnique({ where: { key } });
    if (!row) throw new NotFoundException("Configuração não encontrada.");
    return row;
  }

  private async revision(pilot: { organizationId: string; churchId: string }, id: string) {
    const row = await this.prisma.systemSettingRevision.findFirst({ where: { id, organizationId: pilot.organizationId, churchId: pilot.churchId } });
    if (!row) throw new NotFoundException("Revisão não encontrada.");
    return row;
  }

  private scopeKind(value: string): ScopeKind {
    if (!SCOPE_KINDS.includes(value as ScopeKind)) throw new BadRequestException("Escopo inválido.");
    return value as ScopeKind;
  }

  private assertValue(key: string, valueType: string, value: unknown) {
    if (valueType === "boolean" && typeof value !== "boolean") throw new BadRequestException("Informe um valor lógico.");
    if (valueType === "number" && typeof value !== "number") throw new BadRequestException("Informe um número.");
    if (valueType === "string" && typeof value !== "string") throw new BadRequestException("Informe um texto.");
    if (valueType === "time" && (typeof value !== "string" || parseBrasiliaHour(value) == null)) {
      throw new BadRequestException("Informe um horário HH:mm.");
    }
    if (key === "auth.password_reset.ttl_hours" && clampPasswordResetHours(value, 0) === 0) {
      throw new BadRequestException("A recuperação fica entre 1 e 24 horas.");
    }
    if (key === "notices.birthday.timezone" && !isBirthdayTimeZone(value)) {
      throw new BadRequestException("Escolha um fuso horário do Brasil.");
    }
    if (key === "rosters.survey.open_day" && !(typeof value === "number" && Number.isInteger(value) && value >= 20 && value <= 28)) {
      throw new BadRequestException("O dia de abertura da pesquisa fica entre 20 e 28.");
    }
    if (key === "events.agenda.keep_days_after_end" && !(typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 14)) {
      throw new BadRequestException("A agenda pode manter o evento de 0 a 14 dias após o término.");
    }
    if (key === "service_orders.schedule_conflict" && value !== "warn" && value !== "block") {
      throw new BadRequestException("Escolha avisar com confirmação ou impedir a publicação.");
    }
  }

  private instant(value: string, field: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new BadRequestException(`${field} inválido.`);
    return date;
  }

  private expectFresh(updatedAt: Date, expected?: string) {
    if (expected && expected !== updatedAt.toISOString()) throw new ConflictException("A revisão mudou. Atualize a tela.");
  }

  private view(revision: {
    id: string; catalogKey: string; scopeKind: string; scopeId: string | null; lifecycle: string;
    valueJson: unknown; effectiveFrom: Date | null; effectiveUntil: Date | null; updatedAt: Date; createdAt: Date;
  }) {
    return {
      id: revision.id, key: revision.catalogKey, scopeKind: revision.scopeKind, scopeId: revision.scopeId,
      lifecycle: revision.lifecycle, value: revision.valueJson,
      effectiveFrom: revision.effectiveFrom?.toISOString() ?? null,
      effectiveUntil: revision.effectiveUntil?.toISOString() ?? null,
      updatedAt: revision.updatedAt.toISOString(), createdAt: revision.createdAt.toISOString(),
    };
  }

  private async audit(actor: AuthUser, pilot: { organizationId: string; churchId: string }, action: string, id: string, key: string, db: Pick<PrismaService, "auditLog"> = this.prisma) {
    await db.auditLog.create({
      data: {
        actorUserId: actor.userId, action, resourceType: "system_setting", resourceId: id,
        organizationId: pilot.organizationId, churchId: pilot.churchId, metadata: { key },
      },
    });
  }
}

export type { OperationalScopeKind };
