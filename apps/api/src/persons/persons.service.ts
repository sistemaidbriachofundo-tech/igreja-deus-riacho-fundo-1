import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { canSearchPersons, canManageMemberships } from "@idbrf/shared";
import type { AuthUser } from "../auth/types/auth-user";
import { PrismaService } from "../prisma/prisma.service";
import { PilotService } from "../pilot/pilot.service";

@Injectable()
export class PersonsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pilot: PilotService,
  ) {}

  async search(actor: AuthUser, q: string, limit = 10) {
    const pilot = await this.pilot.getPilotChurch();
    if (
      !canSearchPersons(actor.grants, {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      })
    ) {
      throw new ForbiddenException("Sem permissão para buscar pessoas");
    }

    const query = q.trim();
    if (query.length < 2) {
      return { query, hits: [], autoMergeForbidden: true as const };
    }

    const take = Math.min(Math.max(limit, 1), 50);
    const rows = await this.prisma.person.findMany({
      where: {
        organizationId: pilot.organizationId,
        OR: [
          { displayName: { contains: query, mode: "insensitive" } },
          { email: { contains: query, mode: "insensitive" } },
        ],
      },
      take,
      orderBy: { displayName: "asc" },
      select: {
        id: true,
        displayName: true,
        email: true,
        status: true,
        householdId: true,
        kind: true,
        isMinor: true,
      },
    });

    const qLower = query.toLowerCase();
    const hits = rows.map((person) => {
      const matchReasons: Array<"displayName" | "email"> = [];
      if (person.displayName.toLowerCase().includes(qLower)) {
        matchReasons.push("displayName");
      }
      if (person.email?.toLowerCase().includes(qLower)) {
        matchReasons.push("email");
      }
      const exactName = person.displayName.toLowerCase() === qLower;
      const exactEmail = person.email?.toLowerCase() === qLower;
      const score = exactEmail || exactName ? 0.95 : matchReasons.length > 1 ? 0.85 : 0.7;
      return {
        person: {
          id: person.id,
          displayName: person.displayName,
          email: person.email,
          status: person.status,
          householdId: person.householdId,
        },
        score,
        matchReasons,
      };
    });

    return { query, hits, autoMergeForbidden: true as const };
  }

  async getById(actor: AuthUser, personId: string) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertCanReadPerson(actor, personId, pilot.organizationId, pilot.churchId);

    const person = await this.prisma.person.findFirst({
      where: {
        id: personId,
        organizationId: pilot.organizationId,
      },
      select: {
        id: true,
        displayName: true,
        email: true,
        status: true,
        householdId: true,
        kind: true,
        isMinor: true,
        legalGuardianPersonId: true,
      },
    });
    if (!person) {
      throw new NotFoundException("Pessoa não encontrada neste escopo");
    }
    return person;
  }

  /**
   * Prontuário individual seguro: vínculos + histórico de admissão.
   * SECRETARIA/PASTOR no piloto; MEMBRO só o próprio personId.
   */
  async getDossier(actor: AuthUser, personId: string) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertCanReadPerson(actor, personId, pilot.organizationId, pilot.churchId);

    const person = await this.prisma.person.findFirst({
      where: { id: personId, organizationId: pilot.organizationId },
      select: {
        id: true,
        displayName: true,
        email: true,
        status: true,
        kind: true,
        isMinor: true,
        householdId: true,
        legalGuardianPersonId: true,
        legalGuardian: {
          select: { id: true, displayName: true, email: true },
        },
        dependents: {
          select: { id: true, displayName: true, isMinor: true },
        },
        household: {
          select: {
            id: true,
            label: true,
            persons: { select: { id: true, displayName: true, isMinor: true } },
          },
        },
        memberships: {
          where: { churchId: pilot.churchId },
          select: {
            id: true,
            status: true,
            joinedAt: true,
            notes: true,
          },
          orderBy: { joinedAt: "desc" },
        },
        admissions: {
          where: { churchId: pilot.churchId },
          select: {
            id: true,
            status: true,
            modality: true,
            currentStep: true,
            createdAt: true,
            updatedAt: true,
            modalityRecorded: true,
            documentsComplete: true,
            secretariaApproved: true,
            pastorApproved: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!person) {
      throw new NotFoundException("Pessoa não encontrada neste escopo");
    }

    // MEMBRO: não expor e-mail de terceiros no núcleo familiar além do necessário
    const isStaff = canSearchPersons(actor.grants, {
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
    });

    return {
      person: {
        id: person.id,
        displayName: person.displayName,
        email: isStaff || actor.personId === person.id ? person.email : null,
        status: person.status,
        kind: person.kind,
        isMinor: person.isMinor,
        householdId: person.householdId,
        legalGuardianPersonId: person.legalGuardianPersonId,
      },
      legalGuardian: person.legalGuardian
        ? {
            id: person.legalGuardian.id,
            displayName: person.legalGuardian.displayName,
            email: isStaff ? person.legalGuardian.email : null,
          }
        : null,
      dependents: person.dependents,
      household: person.household
        ? {
            id: person.household.id,
            label: person.household.label,
            members: person.household.persons,
          }
        : null,
      memberships: person.memberships.map((m) => ({
        id: m.id,
        status: m.status,
        joinedAt: m.joinedAt.toISOString(),
        notes: isStaff ? m.notes : null,
      })),
      admissionHistory: person.admissions.map((a) => ({
        id: a.id,
        status: a.status,
        modality: a.modality,
        currentStep: a.currentStep,
        checklist: {
          modalityRecorded: a.modalityRecorded,
          documentsComplete: a.documentsComplete,
          secretariaApproved: a.secretariaApproved,
          pastorApproved: a.pastorApproved,
        },
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
      })),
    };
  }

  async patch(
    actor: AuthUser,
    personId: string,
    input: {
      isMinor?: boolean;
      legalGuardianPersonId?: string | null;
      householdId?: string | null;
    },
  ) {
    const pilot = await this.pilot.getPilotChurch();
    if (
      !canManageMemberships(actor.grants, {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      })
    ) {
      throw new ForbiddenException("Sem permissão de secretaria nesta congregação");
    }

    const person = await this.prisma.person.findFirst({
      where: { id: personId, organizationId: pilot.organizationId },
    });
    if (!person) {
      throw new NotFoundException("Pessoa não encontrada neste escopo");
    }

    const data: {
      isMinor?: boolean;
      legalGuardianPersonId?: string | null;
      householdId?: string | null;
    } = {};

    if (input.isMinor !== undefined) {
      data.isMinor = input.isMinor;
    }

    if (input.legalGuardianPersonId !== undefined) {
      if (input.legalGuardianPersonId === personId) {
        throw new BadRequestException("Responsável legal não pode ser a própria pessoa");
      }
      if (input.legalGuardianPersonId) {
        const guardian = await this.prisma.person.findFirst({
          where: {
            id: input.legalGuardianPersonId,
            organizationId: pilot.organizationId,
            isMinor: false,
          },
        });
        if (!guardian) {
          throw new BadRequestException(
            "Responsável legal deve ser pessoa adulta existente no piloto",
          );
        }
      }
      data.legalGuardianPersonId = input.legalGuardianPersonId;
    }

    if (input.householdId !== undefined) {
      if (input.householdId) {
        const hh = await this.prisma.household.findFirst({
          where: {
            id: input.householdId,
            organizationId: pilot.organizationId,
            churchId: pilot.churchId,
          },
        });
        if (!hh) {
          throw new NotFoundException("Família não encontrada no piloto");
        }
      }
      data.householdId = input.householdId;
    }

    const nextIsMinor = data.isMinor ?? person.isMinor;
    const nextGuardian =
      data.legalGuardianPersonId !== undefined
        ? data.legalGuardianPersonId
        : person.legalGuardianPersonId;
    if (nextIsMinor && !nextGuardian) {
      throw new BadRequestException(
        "Menor de idade exige responsável legal (legalGuardianPersonId)",
      );
    }

    const updated = await this.prisma.person.update({
      where: { id: personId },
      data,
      select: {
        id: true,
        displayName: true,
        email: true,
        status: true,
        householdId: true,
        kind: true,
        isMinor: true,
        legalGuardianPersonId: true,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.userId,
        action: "person.patch",
        resourceType: "person",
        resourceId: personId,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        metadata: {
          fields: Object.keys(data),
          isMinor: updated.isMinor,
          hasGuardian: Boolean(updated.legalGuardianPersonId),
        },
      },
    });

    return updated;
  }

  private assertCanReadPerson(
    actor: AuthUser,
    personId: string,
    organizationId: string,
    churchId: string,
  ): void {
    if (canSearchPersons(actor.grants, { organizationId, churchId })) {
      return;
    }
    if (actor.personId === personId) {
      return;
    }
    throw new ForbiddenException("Sem permissão para consultar esta pessoa");
  }
}
