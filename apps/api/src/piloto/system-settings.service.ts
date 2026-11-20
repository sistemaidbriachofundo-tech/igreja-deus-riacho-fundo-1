import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { effectiveSettingValue, parseBrasiliaHour, ROLE_CODES, windowsOverlap, type OperationalScopeKind } from "@idbrf/shared";
import type { AuthUser } from "../auth/types/auth-user";
import { PrismaService } from "../prisma/prisma.service";
import { PilotService } from "../pilot/pilot.service";
import { assertChurchRole } from "./church";

const SCOPE_KINDS = ["PLATFORM", "CHURCH", "MINISTRY", "MODULE", "GROUP", "TRACK"] as const;
type ScopeKind = (typeof SCOPE_KINDS)[number];
const EDITABLE_SETTINGS = new Set(["notices.birthday.hour_brasilia", "pastoral.titular_user_id", "pastoral.substitute_user_id"]);

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
      items: items.map(item => ({
        key: item.key, title: item.title, description: item.description, valueType: item.valueType,
        scopeKind: item.scopeKind, defaultValue: item.defaultJson, devValue: item.devJson, editable: EDITABLE_SETTINGS.has(item.key),
      })),
    };
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

  async getBirthdayHour(pilot: { organizationId: string; churchId: string }, now: Date) {
    const result = await this.lookup(pilot, "notices.birthday.hour_brasilia", "CHURCH", undefined, now);
    return typeof result.value === "string" ? result.value : "08:00";
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
      where: { catalogKey: key, organizationId: pilot.organizationId },
      orderBy: { createdAt: "asc" },
    });
    return { revisions: revisions.map(revision => this.view(revision)) };
  }

  async draft(actor: AuthUser, input: { key: string; scopeKind?: string; scopeId?: string | null; value: unknown; note?: string | null }) {
    const pilot = await this.admin(actor);
    const catalog = await this.catalogRow(input.key);
    if (!EDITABLE_SETTINGS.has(catalog.key)) throw new BadRequestException("Esta regra está disponível para consulta.");
    const kind = this.scopeKind(input.scopeKind || catalog.scopeKind);
    this.assertValue(catalog.valueType, input.value);
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

  async review(actor: AuthUser, revisionId: string, expectedUpdatedAt?: string) {
    const pilot = await this.admin(actor);
    const current = await this.revision(pilot.organizationId, revisionId);
    this.expectFresh(current.updatedAt, expectedUpdatedAt);
    if (current.lifecycle !== "DRAFT") throw new ConflictException("Somente um rascunho segue para revisão.");
    const updated = await this.prisma.systemSettingRevision.update({
      where: { id: current.id },
      data: { lifecycle: "IN_REVIEW", reviewedByUserId: actor.userId },
    });
    await this.audit(actor, pilot, "system_setting.review", updated.id, current.catalogKey);
    return this.view(updated);
  }

  async publish(actor: AuthUser, revisionId: string, input: { effectiveFrom: string; effectiveUntil?: string | null; expectedUpdatedAt?: string }) {
    const pilot = await this.admin(actor);
    const current = await this.revision(pilot.organizationId, revisionId);
    this.expectFresh(current.updatedAt, input.expectedUpdatedAt);
    if (current.lifecycle !== "IN_REVIEW") throw new ConflictException("A publicação sai da revisão.");
    const from = this.instant(input.effectiveFrom, "effectiveFrom");
    const until = input.effectiveUntil ? this.instant(input.effectiveUntil, "effectiveUntil") : null;
    if (until && until <= from) throw new BadRequestException("A vigência termina depois do início.");
    const updated = await this.prisma.$transaction(async tx => {
      const fresh = await tx.systemSettingRevision.findFirst({ where: { id: current.id, organizationId: pilot.organizationId } });
      if (!fresh) throw new NotFoundException("Revisão não encontrada.");
      this.expectFresh(fresh.updatedAt, input.expectedUpdatedAt);
      if (fresh.lifecycle !== "IN_REVIEW" || fresh.scopeKind !== current.scopeKind || fresh.scopeId !== current.scopeId) {
        throw new ConflictException("A publicação sai da revisão deste escopo.");
      }
      const published = await tx.systemSettingRevision.findMany({
        where: {
          catalogKey: fresh.catalogKey, lifecycle: "PUBLISHED", scopeKind: fresh.scopeKind,
          scopeId: fresh.scopeId, organizationId: pilot.organizationId, id: { not: fresh.id },
        },
      });
      const overlaps = published.some(revision => revision.effectiveFrom && windowsOverlap(
        { from: from.toISOString(), until: until?.toISOString() ?? null },
        { from: revision.effectiveFrom.toISOString(), until: revision.effectiveUntil?.toISOString() ?? null },
      ));
      if (overlaps) throw new ConflictException("Já existe vigência publicada para este escopo.");
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

  private async revision(organizationId: string, id: string) {
    const row = await this.prisma.systemSettingRevision.findFirst({ where: { id, organizationId } });
    if (!row) throw new NotFoundException("Revisão não encontrada.");
    return row;
  }

  private scopeKind(value: string): ScopeKind {
    if (!SCOPE_KINDS.includes(value as ScopeKind)) throw new BadRequestException("Escopo inválido.");
    return value as ScopeKind;
  }

  private assertValue(valueType: string, value: unknown) {
    if (valueType === "boolean" && typeof value !== "boolean") throw new BadRequestException("Informe um valor lógico.");
    if (valueType === "number" && typeof value !== "number") throw new BadRequestException("Informe um número.");
    if (valueType === "string" && typeof value !== "string") throw new BadRequestException("Informe um texto.");
    if (valueType === "time" && (typeof value !== "string" || parseBrasiliaHour(value) == null)) {
      throw new BadRequestException("Informe um horário HH:mm.");
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

  private async audit(actor: AuthUser, pilot: { organizationId: string; churchId: string }, action: string, id: string, key: string) {
    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.userId, action, resourceType: "system_setting", resourceId: id,
        organizationId: pilot.organizationId, churchId: pilot.churchId, metadata: { key },
      },
    });
  }
}

export type { OperationalScopeKind };
