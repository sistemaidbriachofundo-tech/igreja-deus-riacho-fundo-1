import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  canManageMemberships,
  cpfDigits,
  homonymWarningEnabled,
  identityDecision,
  isValidCpf,
  normalizePersonName,
  type EcclesiasticalRole,
  type PreventiveExisting,
} from "@idbrf/shared";
import type { AuthUser } from "../auth/types/auth-user";
import { BusinessException } from "../common/business.exception";
import { identityFingerprint, identityPepper, throwPreventive } from "../common/preventive-conflict";
import { PrismaService } from "../prisma/prisma.service";
import { PilotService } from "../pilot/pilot.service";
import {
  membershipLeadershipSelect,
  normalizeEcclesiasticalRoles,
  normalizeMembershipNotes,
  parseExpectedUpdatedAt,
  rejectMembershipRegulatedPatch,
  type MembershipNotesPatch,
} from "./membership-patch";

export interface RegisterMembershipInput {
  displayName: string;
  email?: string;
  notes?: string;
  ecclesiasticalRoles?: EcclesiasticalRole[];
  householdLabel?: string;
  householdId?: string;
  address?: string;
  birthDate?: string;
  baptismDate?: string;
  firstAttendedOn?: string;
  weddingDate?: string;
  sex?: "MALE" | "FEMALE" | "OTHER";
  isMinor?: boolean;
  legalGuardianPersonId?: string;
  /** Se informado, vincula pessoa existente; senão cria pessoa fictícia. */
  personId?: string;
  /** Onze dígitos. O serviço grava só o HMAC e não devolve o número. */
  identityDocument?: string;
  /** Confirma cadastro mesmo com homônimo. Não dispensa e-mail ou CPF exato. */
  acknowledgeHomonym?: boolean;
}

/** Apenas datas civis válidas; jamais deixar Date normalizar 31 de fevereiro. */
export function calendarDay(value: string | undefined, label: string): Date | undefined {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException(label + ": informe DD/MM/AAAA no formulário.");
  const date = new Date(value + "T00:00:00.000Z");
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== value)
    throw new BadRequestException(label + ": data inválida.");
  if (date.getTime() > Date.now()) throw new BadRequestException(label + ": a data não pode ser futura.");
  return date;
}

export function isUnder18(birthDate: Date, now = new Date()): boolean {
  const birth = birthDate.toISOString().slice(0,10);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone:"America/Sao_Paulo", year:"numeric",month:"2-digit",day:"2-digit" }).formatToParts(now);
  const get = (name: string) => Number(parts.find(item => item.type === name)?.value ?? 0);
  const year = get("year"), month = get("month"), day = get("day");
  const [by,bm,bd] = birth.split("-").map(Number);
  return year - by - (month < bm || (month === bm && day < bd) ? 1 : 0) < 18;
}

@Injectable()
export class MembershipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pilot: PilotService,
  ) {}

  async listForPilot(actor: AuthUser) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertCanManage(actor, pilot.organizationId, pilot.churchId);

    const rows = await this.prisma.churchMembership.findMany({
      where: {
        churchId: pilot.churchId,
        organizationId: pilot.organizationId,
      },
      include: {
        person: {
          select: {
            id: true,
            displayName: true,
            email: true,
            status: true,
            householdId: true,
            kind: true,
            isMinor: true,
            ...membershipLeadershipSelect(pilot),
          },
        },
        credentials: {
          where: { status: "ACTIVE" },
          select: {
            id: true,
            status: true,
            issuedAt: true,
          },
          take: 1,
        },
      },
      orderBy: { joinedAt: "desc" },
    });

    return {
      church: {
        id: pilot.churchId,
        slug: pilot.churchSlug,
        name: pilot.churchName,
      },
      memberships: rows.map((row) => {
        const { ministryLeads, ministryMemberships, ...person } = row.person;
        return {
          id: row.id,
          status: row.status,
          joinedAt: row.joinedAt.toISOString(),
          notes: row.notes,
          ecclesiasticalRoles: row.ecclesiasticalRoles,
          ministryLeader: Boolean(ministryLeads?.length || ministryMemberships?.length),
          person,
          activeCredentialId: row.credentials[0]?.id ?? null,
        };
      }),
    };
  }

  async register(actor: AuthUser, input: RegisterMembershipInput) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertCanManage(actor, pilot.organizationId, pilot.churchId);

    const displayName = input.displayName?.trim();
    if (!displayName) {
      throw new BadRequestException("displayName é obrigatório");
    }

    const ecclesiasticalRoles = input.ecclesiasticalRoles === undefined
      ? undefined : normalizeEcclesiasticalRoles(input.ecclesiasticalRoles);
    let personId = input.personId?.trim();

    // Regras de dados apenas para novos cadastros; pessoas existentes não são
    // modificadas indiretamente por este endpoint.
    const birthDate = personId ? undefined : calendarDay(input.birthDate, "Nascimento");
    const baptismDate = personId ? undefined : calendarDay(input.baptismDate, "Batismo");
    const weddingDate = personId ? undefined : calendarDay(input.weddingDate, "Casamento");
    const firstAttendedOn = personId ? undefined : calendarDay(input.firstAttendedOn, "Primeira frequência");
    const isMinor = !personId && (birthDate ? isUnder18(birthDate) : input.isMinor === true);
    if (!personId && input.isMinor === true && birthDate && !isUnder18(birthDate)) {
      throw new BadRequestException("Verifique o nascimento: a pessoa já é maior de idade.");
    }
    if (!personId && isMinor && !input.legalGuardianPersonId?.trim()) {
      throw new BadRequestException("Informe o responsável legal para o cadastro de menor.");
    }
    if (!personId && input.legalGuardianPersonId) {
      const guardian = await this.prisma.person.findFirst({
        where: {
          id: input.legalGuardianPersonId, organizationId: pilot.organizationId,
          homeChurchId: pilot.churchId, isMinor: false,
        }, select: { id: true, birthDate: true },
      });
      if (!guardian || (guardian.birthDate && isUnder18(guardian.birthDate))) {
        throw new BadRequestException("Responsável legal inválido ou menor de idade.");
      }
    }

    if (personId) {
      const existing = await this.prisma.person.findFirst({
        where: {
          id: personId,
          organizationId: pilot.organizationId,
        },
      });
      if (!existing) {
        throw new NotFoundException("Pessoa não encontrada neste escopo");
      }
    } else {
      return this.registerNewPerson(actor, pilot, input, {
        displayName, birthDate, baptismDate, weddingDate, firstAttendedOn, isMinor, ecclesiasticalRoles,
      });
    }

    const duplicate = await this.prisma.churchMembership.findUnique({
      where: {
        personId_churchId: {
          personId,
          churchId: pilot.churchId,
        },
      },
    });
    if (duplicate) {
      throw new ConflictException("Membresia já existe para esta pessoa");
    }

    // Legado: não ativa membresia sem protocolo pastoral — preferir /admissions.
    const membership = await this.prisma.churchMembership.create({
      data: {
        personId,
        churchId: pilot.churchId,
        organizationId: pilot.organizationId,
        status: "PENDING_ADMISSION",
        notes: input.notes?.trim() || null,
        ...(ecclesiasticalRoles === undefined ? {} : { ecclesiasticalRoles }),
      },
      include: {
        person: {
          select: {
            id: true,
            displayName: true,
            email: true,
            status: true,
            householdId: true,
            kind: true,
            isMinor: true,
          },
        },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.userId,
        action: "membership.register",
        resourceType: "church_membership",
        resourceId: membership.id,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        metadata: { personId },
      },
    });

    return {
      id: membership.id,
      status: membership.status,
      joinedAt: membership.joinedAt.toISOString(),
      notes: membership.notes,
      person: membership.person,
      churchId: membership.churchId,
      organizationId: membership.organizationId,
    };
  }

  /**
   * Observação do vínculo no piloto. Situação e data de saída permanecem
   * nos fluxos de admissão e transferência.
   */
  async patch(actor: AuthUser, membershipId: string, input: MembershipNotesPatch) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertCanManage(actor, pilot.organizationId, pilot.churchId);
    rejectMembershipRegulatedPatch(input);
    if (typeof input.notes === "string") {
      normalizeMembershipNotes(input.notes);
    }

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.churchMembership.findFirst({
        where: {
          id: membershipId,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
        },
      });
      if (!row) {
        throw new NotFoundException("Vínculo não encontrado neste escopo");
      }

      if (input.expectedUpdatedAt !== undefined) {
        const expected = parseExpectedUpdatedAt(input.expectedUpdatedAt);
        if (
          !(row.updatedAt instanceof Date) ||
          row.updatedAt.getTime() !== expected.getTime()
        ) {
          throw new BusinessException(
            "O vínculo foi alterado por outra gravação. Reabra antes de salvar.",
            "MEMBERSHIP_VERSION_CONFLICT",
            409,
          );
        }
      }

      const data: { notes?: string | null; ecclesiasticalRoles?: EcclesiasticalRole[] } = {};
      if (input.notes !== undefined) {
        const notes = normalizeMembershipNotes(input.notes);
        if (notes !== row.notes) data.notes = notes;
      }
      if (input.ecclesiasticalRoles !== undefined) {
        const next = normalizeEcclesiasticalRoles(input.ecclesiasticalRoles);
        const stored = row.ecclesiasticalRoles ?? [];
        if (next.length !== stored.length || next.some(role => !stored.includes(role))) data.ecclesiasticalRoles = next;
      }
      const fields = Object.keys(data);
      if (!fields.length) return this.toMembershipPatch(row);

      if (
        !(row.updatedAt instanceof Date) ||
        Number.isNaN(row.updatedAt.getTime())
      ) {
        throw new BusinessException(
          "Concorrência otimista indisponível: o vínculo não tem updatedAt.",
          "MEMBERSHIP_VERSION_UNSUPPORTED",
          409,
        );
      }

      const written = await tx.churchMembership.updateMany({
        where: {
          id: membershipId,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          updatedAt: row.updatedAt,
        },
        data,
      });
      if (written.count !== 1) {
        throw new BusinessException(
          "O vínculo foi alterado por outra gravação. Reabra antes de salvar.",
          "MEMBERSHIP_VERSION_CONFLICT",
          409,
        );
      }

      const updated = await tx.churchMembership.findFirst({
        where: {
          id: membershipId,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
        },
      });
      if (!updated) {
        throw new NotFoundException("Vínculo não encontrado neste escopo");
      }

      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: data.ecclesiasticalRoles === undefined ? "membership.notes.patch" : "membership.ecclesiastical-roles.patch",
          resourceType: "church_membership",
          resourceId: membershipId,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: {
            fields,
            before: {
              ...(data.notes !== undefined ? { notes: row.notes } : {}),
              ...(data.ecclesiasticalRoles !== undefined ? { ecclesiasticalRoles: row.ecclesiasticalRoles ?? [] } : {}),
            },
            after: {
              ...(data.notes !== undefined ? { notes: updated.notes } : {}),
              ...(data.ecclesiasticalRoles !== undefined ? { ecclesiasticalRoles: updated.ecclesiasticalRoles } : {}),
            },
            status: updated.status,
          },
        },
      });

      return this.toMembershipPatch(updated);
    });
  }

  private toMembershipPatch(row: {
    id: string;
    personId: string;
    churchId: string;
    organizationId: string;
    status: string;
    joinedAt: Date;
    leftAt?: Date | null;
    notes: string | null;
    ecclesiasticalRoles?: EcclesiasticalRole[];
    updatedAt?: Date | null;
  }) {
    return {
      id: row.id,
      personId: row.personId,
      churchId: row.churchId,
      organizationId: row.organizationId,
      status: row.status,
      joinedAt: row.joinedAt.toISOString(),
      leftAt: row.leftAt instanceof Date ? row.leftAt.toISOString() : null,
      notes: row.notes,
      ...(row.ecclesiasticalRoles === undefined ? {} : { ecclesiasticalRoles: row.ecclesiasticalRoles }),
      ...(row.updatedAt instanceof Date
        ? { updatedAt: row.updatedAt.toISOString() }
        : {}),
    };
  }

  private async registerNewPerson(
    actor: AuthUser,
    pilot: { organizationId: string; churchId: string },
    input: RegisterMembershipInput,
    profile: {
      displayName: string;
      birthDate?: Date;
      baptismDate?: Date;
      weddingDate?: Date;
      firstAttendedOn?: Date;
      isMinor: boolean;
      ecclesiasticalRoles?: EcclesiasticalRole[];
    },
  ) {
    if (input.householdId && input.householdLabel) {
      throw new BadRequestException("Selecione a família existente ou cadastre um novo núcleo.");
    }
    const email = input.email?.trim().toLowerCase() || null;
    const digits = input.identityDocument ? cpfDigits(input.identityDocument) : "";
    let fingerprint: string | null = null;
    if (digits) {
      if (!isValidCpf(digits)) throw new BadRequestException("Confira o CPF. O cadastro não foi criado.");
      const pepper = identityPepper();
      if (!pepper) {
        throw new BadRequestException("A conferência de CPF não está disponível neste ambiente. Deixe o campo em branco para continuar sem ela.");
      }
      fingerprint = identityFingerprint(pilot.organizationId, digits, pepper);
    }
    const nameKey = normalizePersonName(profile.displayName);
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${pilot.organizationId + ":" + (fingerprint ?? email ?? nameKey)}))`;
      const emailHit = email
        ? await tx.person.findFirst({
          where: { organizationId: pilot.organizationId, email: { equals: email, mode: "insensitive" } },
          select: { id: true, status: true },
        })
        : null;
      const fingerprintHit = fingerprint
        ? await tx.person.findFirst({
          where: { organizationId: pilot.organizationId, identityFingerprint: fingerprint },
          select: { id: true, status: true },
        })
        : null;
      const homonymWarning = await this.homonymWarning(tx as never, pilot.organizationId, pilot.churchId);
      const homonymHit = homonymWarning ? await this.findHomonym(tx as never, pilot.organizationId, nameKey) : null;
      throwPreventive(identityDecision({
        acknowledgeHomonym: input.acknowledgeHomonym === true,
        homonymWarning,
        emailHit,
        fingerprintHit,
        homonymHit,
      }));

      let householdId: string | undefined;
      if (input.householdId?.trim()) {
        const family = await tx.household.findFirst({
          where: { id: input.householdId, organizationId: pilot.organizationId, churchId: pilot.churchId },
          select: { id: true },
        });
        if (!family) throw new BadRequestException("Família não encontrada nesta congregação.");
        householdId = family.id;
      } else if (input.householdLabel?.trim()) {
        const household = await tx.household.create({
          data: { organizationId: pilot.organizationId, churchId: pilot.churchId, label: input.householdLabel.trim() },
        });
        householdId = household.id;
      }
      const person = await tx.person.create({
        data: {
          organizationId: pilot.organizationId,
          homeChurchId: pilot.churchId,
          householdId,
          displayName: profile.displayName,
          email,
          address: input.address?.trim() || null,
          birthDate: profile.birthDate,
          baptismDate: profile.baptismDate,
          weddingDate: profile.weddingDate,
          firstAttendedOn: profile.firstAttendedOn,
          sex: input.sex ?? null,
          isMinor: profile.isMinor,
          legalGuardianPersonId: input.legalGuardianPersonId?.trim() || null,
          identityFingerprint: fingerprint,
          status: "ACTIVE",
        },
      });
      const membership = await tx.churchMembership.create({
        data: {
          personId: person.id,
          churchId: pilot.churchId,
          organizationId: pilot.organizationId,
          status: "PENDING_ADMISSION",
          notes: input.notes?.trim() || null,
          ...(profile.ecclesiasticalRoles === undefined ? {} : { ecclesiasticalRoles: profile.ecclesiasticalRoles }),
        },
        include: {
          person: {
            select: { id: true, displayName: true, email: true, status: true, householdId: true, kind: true, isMinor: true },
          },
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "membership.register",
          resourceType: "church_membership",
          resourceId: membership.id,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: { personId: person.id, homonymAcknowledged: input.acknowledgeHomonym === true },
        },
      });
      return {
        id: membership.id,
        status: membership.status,
        joinedAt: membership.joinedAt.toISOString(),
        notes: membership.notes,
        person: membership.person,
        churchId: membership.churchId,
        organizationId: membership.organizationId,
      };
    });
  }

  private async homonymWarning(tx: {
    systemSettingCatalog?: { findUnique: (args: unknown) => Promise<{ devJson: unknown } | null> };
    systemSettingRevision?: { findFirst: (args: unknown) => Promise<{ valueJson: unknown } | null> };
  }, organizationId: string, churchId: string): Promise<boolean> {
    const published = tx.systemSettingRevision?.findFirst
      ? await tx.systemSettingRevision.findFirst({
        where: { catalogKey: "secretaria.homonym_warning", lifecycle: "PUBLISHED", organizationId, churchId },
        orderBy: { effectiveFrom: "desc" },
        select: { valueJson: true },
      })
      : null;
    if (published) return homonymWarningEnabled(published.valueJson);
    if (!tx.systemSettingCatalog?.findUnique) return true;
    const catalog = await tx.systemSettingCatalog.findUnique({
      where: { key: "secretaria.homonym_warning" },
      select: { devJson: true },
    });
    return homonymWarningEnabled(catalog?.devJson ?? true);
  }

  private async findHomonym(
    tx: { person: { findMany: (args: unknown) => Promise<Array<{ id: string; status: string; displayName: string }>> } },
    organizationId: string,
    nameKey: string,
  ): Promise<PreventiveExisting | null> {
    const token = nameKey.split(" ").filter((part) => part.length >= 3).at(-1);
    if (!token || !tx.person.findMany) return null;
    const rows = await tx.person.findMany({
      where: { organizationId, displayName: { contains: token, mode: "insensitive" } },
      select: { id: true, status: true, displayName: true },
      take: 30,
    });
    const hit = rows.find((row) => normalizePersonName(row.displayName) === nameKey);
    return hit ? { id: hit.id, status: hit.status } : null;
  }

  private assertCanManage(
    actor: AuthUser,
    organizationId: string,
    churchId: string,
  ): void {
    if (
      !canManageMemberships(actor.grants, {
        organizationId,
        churchId,
      })
    ) {
      throw new ForbiddenException(
        "Sem permissão de secretaria nesta congregação",
      );
    }
  }
}
