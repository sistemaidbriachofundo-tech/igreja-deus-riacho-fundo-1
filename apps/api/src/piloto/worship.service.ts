import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ROLE_CODES } from "@idbrf/shared";
import type { AuthUser } from "../auth/types/auth-user";
import { PrismaService } from "../prisma/prisma.service";
import { PilotService } from "../pilot/pilot.service";
import { assertChurchRole } from "./church";

const WORSHIP_ROLES = [ROLE_CODES.LIDER_MINISTERIO, ROLE_CODES.PASTOR, ROLE_CODES.PLATFORM_ADMIN, ROLE_CODES.SECRETARIA] as const;
const VOCAL = ["SOPRANO", "MEZZO_SOPRANO", "CONTRALTO", "TENOR", "BASS", "UNSPECIFIED"] as const;

@Injectable()
export class WorshipService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pilot: PilotService,
  ) {}

  async saveVocalProfile(actor: AuthUser, personId: string, input: { classification: string; functions: string[] }) {
    const pilot = await this.lead(actor);
    if (!VOCAL.includes(input.classification as typeof VOCAL[number])) throw new BadRequestException("Classificação vocal inválida.");
    const functions = [...new Set(input.functions.map(item => item.trim()).filter(Boolean))].slice(0, 8);
    if (!functions.length) throw new BadRequestException("Informe ao menos uma função.");
    const person = await this.prisma.person.findFirst({
      where: { id: personId, organizationId: pilot.organizationId, homeChurchId: pilot.churchId },
      select: { id: true },
    });
    if (!person) throw new NotFoundException("Pessoa não encontrada nesta congregação.");
    const saved = await this.prisma.personVocalProfile.upsert({
      where: { personId },
      create: { personId, churchId: pilot.churchId, classification: input.classification as typeof VOCAL[number], functions },
      update: { classification: input.classification as typeof VOCAL[number], functions },
    });
    return { personId: saved.personId, classification: saved.classification, functions: saved.functions };
  }

  async vocalProfile(actor: AuthUser, personId: string) {
    const pilot = await this.lead(actor);
    const profile = await this.prisma.personVocalProfile.findFirst({ where: { personId, churchId: pilot.churchId } });
    if (!profile) throw new NotFoundException("Perfil vocal não encontrado.");
    return { personId: profile.personId, classification: profile.classification, functions: profile.functions };
  }

  async exportRoster(actor: AuthUser, rosterId: string) {
    const pilot = await this.lead(actor);
    const roster = await this.prisma.roster.findFirst({
      where: { id: rosterId, churchId: pilot.churchId },
      include: {
        slots: { orderBy: { sortOrder: "asc" }, include: { assignments: { where: { status: { in: ["PENDING", "CONFIRMED"] } } } } },
      },
    });
    if (!roster) throw new NotFoundException("Escala não encontrada.");
    const personIds = roster.slots.flatMap(slot => slot.assignments.map(item => item.personId));
    const profiles = await this.prisma.personVocalProfile.findMany({ where: { personId: { in: personIds }, churchId: pilot.churchId } });
    const byPerson = new Map(profiles.map(profile => [profile.personId, profile]));
    return {
      rosterId: roster.id,
      serviceAt: roster.serviceAt.toISOString(),
      slots: roster.slots.map(slot => ({
        id: slot.id, roleLabel: slot.roleLabel, sector: slot.sector, zone: slot.zone, side: slot.side, manualFill: slot.manualFill,
        people: slot.assignments.map(item => ({
          personId: item.personId,
          classification: byPerson.get(item.personId)?.classification ?? null,
          functions: byPerson.get(item.personId)?.functions ?? [],
        })),
      })),
    };
  }

  async createRepertoire(actor: AuthUser, input: {
    rosterId?: string | null; serviceAt: string; idempotencyKey: string;
    items: Array<{ title: string; musicalKey: string; materials?: string | null }>;
  }) {
    const pilot = await this.lead(actor, true);
    const access = await this.access(actor, input.rosterId ?? null, pilot.churchId);
    if (!access.canEdit || !access.serviceAt) throw new ForbiddenException("Somente o Ministro de Louvor escalado cria o repertório.");
    if (!input.idempotencyKey || input.idempotencyKey.length > 80) throw new BadRequestException("Informe a chave de idempotência.");
    const existing = await this.prisma.worshipRepertoire.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: { items: true } });
    if (existing) {
      if (existing.churchId !== pilot.churchId || existing.rosterId !== input.rosterId || existing.createdByUserId !== actor.userId) throw new ConflictException("A chave já foi usada em outra congregação.");
      return this.view(existing);
    }
    const serviceAt = access.serviceAt;
    const items = input.items.map((item, index) => ({
      sortOrder: index + 1, title: item.title.trim(), musicalKey: item.musicalKey.trim(), materials: item.materials?.trim() || null,
    }));
    if (!items.length || items.some(item => !item.title || !item.musicalKey)) throw new BadRequestException("Informe ordem, título e tom.");
    const created = await this.prisma.worshipRepertoire.create({
      data: {
        organizationId: pilot.organizationId, churchId: pilot.churchId, rosterId: input.rosterId ?? null, serviceAt,
        idempotencyKey: input.idempotencyKey, createdByUserId: actor.userId, status: "DRAFT",
        items: { create: items },
      },
      include: { items: true },
    });
    return this.view(created);
  }

  async updateDraft(actor: AuthUser, repertoireId: string, input: { items: Array<{ title: string; musicalKey: string; materials?: string | null }> }) {
    const pilot = await this.lead(actor, true);
    const repertoire = await this.owned(pilot.churchId, repertoireId);
    const access = await this.access(actor, repertoire.rosterId, pilot.churchId);
    if (!access.canEdit) throw new ForbiddenException("Somente o Ministro de Louvor escalado edita o rascunho.");
    if (repertoire.status !== "DRAFT") throw new ConflictException("Só o rascunho pode ser editado.");
    const items = input.items.map((item, index) => ({
      sortOrder: index + 1, title: item.title.trim(), musicalKey: item.musicalKey.trim(), materials: item.materials?.trim() || null,
    }));
    if (!items.length || items.some(item => !item.title || !item.musicalKey)) throw new BadRequestException("Informe ordem, título e tom.");
    const updated = await this.prisma.worshipRepertoire.update({
      where: { id: repertoireId, status: "DRAFT" },
      data: { items: { deleteMany: {}, create: items } },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });
    return this.view(updated);
  }

  async repertoireForRoster(actor: AuthUser, rosterId: string) {
    const pilot = await this.lead(actor, true);
    return this.repertoireView(actor, pilot.churchId, rosterId);
  }

  async repertoireForAssignment(actor: AuthUser, assignmentId: string) {
    const pilot = await this.lead(actor, true);
    const assignment = await this.prisma.rosterAssignment.findFirst({
      where: { id: assignmentId, personId: actor.personId, status: { in: ["PENDING", "CONFIRMED"] }, slot: { roster: { churchId: pilot.churchId, status: "PUBLISHED" } } },
      select: { slot: { select: { rosterId: true } } },
    });
    if (!assignment) throw new NotFoundException("Escala não encontrada.");
    return this.repertoireView(actor, pilot.churchId, assignment.slot.rosterId);
  }

  async authorize(actor: AuthUser, repertoireId: string) {
    const pilot = await this.lead(actor, true);
    const repertoire = await this.owned(pilot.churchId, repertoireId);
    if (!repertoire.rosterId) throw new ConflictException("O repertório precisa da escala do culto.");
    const access = await this.access(actor, repertoire.rosterId, pilot.churchId);
    if (!access.canEdit) throw new ForbiddenException("Somente o Ministro de Louvor escalado autoriza o repertório.");
    if (repertoire.status === "AUTHORIZED" || repertoire.status === "SCHEDULED") return this.view(repertoire);
    const updated = await this.prisma.worshipRepertoire.update({
      where: { id: repertoire.id },
      data: { status: "AUTHORIZED", authorizedByUserId: actor.userId, authorizedAt: new Date() },
      include: { items: true },
    });
    return this.view(updated);
  }

  async schedule(actor: AuthUser, repertoireId: string, input: { scheduledAt?: string | null } = {}) {
    const pilot = await this.lead(actor, true);
    const repertoire = await this.owned(pilot.churchId, repertoireId);
    const access = await this.access(actor, repertoire.rosterId, pilot.churchId);
    if (!access.canEdit) throw new ForbiddenException("Somente o Ministro de Louvor escalado envia o repertório.");
    const when = input.scheduledAt ? new Date(input.scheduledAt) : new Date();
    if (input.scheduledAt && Number.isNaN(when.getTime())) throw new BadRequestException("scheduledAt inválido.");
    if (repertoire.status === "SCHEDULED") {
      const notices = await this.prisma.worshipRepertoireNotice.count({ where: { repertoireId } });
      return { ...this.view(repertoire), notices, replay: true };
    }
    if (repertoire.status !== "AUTHORIZED") throw new ConflictException("Autorize o repertório antes de agendar.");
    if (!repertoire.rosterId) throw new ConflictException("O repertório precisa da escala vigente.");
    const assignments = await this.prisma.rosterAssignment.findMany({
      where: { status: { in: ["PENDING", "CONFIRMED"] }, slot: { rosterId: repertoire.rosterId, roster: { churchId: pilot.churchId, status: "PUBLISHED" } } },
      select: { personId: true },
    });
    const recipients = [...new Set(assignments.map(item => item.personId))];
    if (!recipients.length) throw new ConflictException("A escala vigente não tem destinatários.");
    await this.prisma.worshipRepertoireNotice.createMany({
      data: recipients.map(recipientPersonId => ({ repertoireId, recipientPersonId })),
      skipDuplicates: true,
    });
    const updated = await this.prisma.worshipRepertoire.update({
      where: { id: repertoire.id },
      data: { status: "SCHEDULED", scheduledAt: when },
      include: { items: true },
    });
    return { ...this.view(updated), notices: recipients.length, replay: false };
  }

  private async lead(actor: AuthUser, allowMember = false) {
    const pilot = await this.pilot.getPilotChurch();
    assertChurchRole(actor, pilot, allowMember ? [...WORSHIP_ROLES, ROLE_CODES.MEMBRO] : WORSHIP_ROLES);
    return pilot;
  }

  private async owned(churchId: string, id: string) {
    const row = await this.prisma.worshipRepertoire.findFirst({ where: { id, churchId }, include: { items: { orderBy: { sortOrder: "asc" } } } });
    if (!row) throw new NotFoundException("Repertório não encontrado.");
    return row;
  }

  private async repertoireView(actor: AuthUser, churchId: string, rosterId: string) {
    const access = await this.access(actor, rosterId, churchId);
    if (!access.canRead) throw new ForbiddenException("O repertório fica com a equipe vigente e o Ministro de Louvor.");
    const repertoire = await this.prisma.worshipRepertoire.findFirst({
      where: { rosterId, churchId },
      include: { items: { orderBy: { sortOrder: "asc" } } },
      orderBy: { updatedAt: "desc" },
    });
    const published = repertoire?.status === "SCHEDULED" && repertoire.scheduledAt && repertoire.scheduledAt <= new Date();
    const visible = access.canEdit || published ? repertoire : null;
    return {
      id: visible?.id ?? null,
      rosterId,
      serviceAt: access.serviceAt?.toISOString(),
      items: visible?.items.map(item => ({ order: item.sortOrder, title: item.title, musicalKey: item.musicalKey, materials: item.materials })) ?? [],
      team: access.team,
      canEdit: access.canEdit,
      status: visible?.status ?? null,
      scheduledAt: visible?.scheduledAt?.toISOString() ?? null,
    };
  }

  private async access(actor: AuthUser, rosterId: string | null, churchId: string) {
    if (!rosterId) return { canRead: false, canEdit: false, team: [], serviceAt: null };
    const roster = await this.prisma.roster.findFirst({
      where: { id: rosterId, churchId, ministry: { slug: { in: ["louvor", "louvor-demo"] } } },
      select: {
        ministryId: true, serviceAt: true, status: true,
        slots: { select: { roleLabel: true, assignments: {
          where: { status: { in: ["PENDING", "CONFIRMED"] } },
          select: { personId: true, person: { select: { displayName: true } } },
        } } },
      },
    });
    if (!roster) throw new NotFoundException("Escala de Louvor não encontrada.");
    const team = roster.slots.flatMap(slot => slot.assignments.map(item => ({
      personId: item.personId, name: item.person.displayName, role: slot.roleLabel,
    })));
    const mine = team.filter(item => item.personId === actor.personId);
    const canEdit = roster.status === "PUBLISHED" && mine.some(item => /ministro de louvor/i.test(item.role));
    const staff = actor.grants.some(grant => grant.roleCode === ROLE_CODES.PASTOR || grant.roleCode === ROLE_CODES.SECRETARIA || grant.roleCode === ROLE_CODES.PLATFORM_ADMIN
      || (grant.roleCode === ROLE_CODES.LIDER_MINISTERIO && grant.ministryId === roster.ministryId));
    return { canRead: staff || (roster.status === "PUBLISHED" && mine.length > 0), canEdit, team, serviceAt: roster.serviceAt };
  }

  private view(row: {
    id: string; status: string; serviceAt: Date; rosterId: string | null; idempotencyKey: string; scheduledAt?: Date | null;
    items: Array<{ sortOrder: number; title: string; musicalKey: string; materials: string | null }>;
  }) {
    return {
      id: row.id, status: row.status, serviceAt: row.serviceAt.toISOString(), rosterId: row.rosterId,
      idempotencyKey: row.idempotencyKey, scheduledAt: row.scheduledAt?.toISOString() ?? null,
      items: row.items.map(item => ({ order: item.sortOrder, title: item.title, musicalKey: item.musicalKey, materials: item.materials })),
    };
  }
}
