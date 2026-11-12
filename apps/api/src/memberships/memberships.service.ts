import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { canManageMemberships } from "@idbrf/shared";
import type { AuthUser } from "../auth/types/auth-user";
import { BusinessException } from "../common/business.exception";
import { PrismaService } from "../prisma/prisma.service";
import { PilotService } from "../pilot/pilot.service";
import {
  normalizeMembershipNotes,
  parseExpectedUpdatedAt,
  rejectMembershipRegulatedPatch,
  type MembershipNotesPatch,
} from "./membership-patch";

export interface RegisterMembershipInput {
  displayName: string;
  email?: string;
  notes?: string;
  householdLabel?: string;
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
}

/** Apenas datas civis válidas; jamais deixar Date normalizar 31 de fevereiro. */
export function calendarDay(value: string | undefined, label: string): Date | undefined {
  if (!value) return undefined;
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) throw new BadRequestException(label + ": informe DD/MM/AAAA no formulário.");
  const date = new Date(value + "T00:00:00.000Z");
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== value)
    throw new BadRequestException(label + ": data inválida.");
  if (date.getTime() > Date.now()) throw new BadRequestException(label + ": a data não pode ser futura.");
  return date;
}

export function isUnder18(birthDate: Date, now = new Date()): boolean {
  const birth = birthDate.toISOString().slice(0,10);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone:"America/Sao_Paulo", year:"numeric",month:"2-digit",day:"2-digit" }).format(now);
  const [year,month,day] = today.split("-").map(Number);
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
      memberships: rows.map((row) => ({
        id: row.id,
        status: row.status,
        joinedAt: row.joinedAt.toISOString(),
        notes: row.notes,
        person: row.person,
        activeCredentialId: row.credentials[0]?.id ?? null,
      })),
    };
  }

  async register(actor: AuthUser, input: RegisterMembershipInput) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertCanManage(actor, pilot.organizationId, pilot.churchId);

    const displayName = input.displayName?.trim();
    if (!displayName) {
      throw new BadRequestException("displayName é obrigatório");
    }

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
      let householdId: string | undefined;
      if (input.householdLabel?.trim()) {
        const household = await this.prisma.household.create({
          data: {
            organizationId: pilot.organizationId,
            churchId: pilot.churchId,
            label: input.householdLabel.trim(),
          },
        });
        householdId = household.id;
      }

      const person = await this.prisma.person.create({
        data: {
          organizationId: pilot.organizationId,
          homeChurchId: pilot.churchId,
          householdId,
          displayName,
          email: input.email?.trim().toLowerCase() || null,
          address: input.address?.trim() || null,
          birthDate,
          baptismDate,
          weddingDate,
          firstAttendedOn,
          sex: input.sex ?? null,
          isMinor,
          legalGuardianPersonId: input.legalGuardianPersonId?.trim() || null,
          status: "ACTIVE",
        },
      });
      personId = person.id;
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

      if (input.notes === undefined) {
        return this.toMembershipPatch(row);
      }

      const notes = normalizeMembershipNotes(input.notes);
      if (notes === row.notes) {
        return this.toMembershipPatch(row);
      }

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
        data: { notes },
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
          action: "membership.notes.patch",
          resourceType: "church_membership",
          resourceId: membershipId,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: {
            fields: ["notes"],
            before: { notes: row.notes },
            after: { notes: updated.notes },
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
      ...(row.updatedAt instanceof Date
        ? { updatedAt: row.updatedAt.toISOString() }
        : {}),
    };
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
