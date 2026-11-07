import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  canSearchPersons,
  canManageMemberships,
  isStrongPersonDedupeMatch,
  scorePersonDedupeMatch,
  type PersonDedupeMatchReason,
  type PersonPhotoStubDto,
} from "@idbrf/shared";
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
      take: Math.min(take * 3, 150),
      orderBy: { displayName: "asc" },
      select: {
        id: true,
        displayName: true,
        email: true,
        status: true,
        householdId: true,
        kind: true,
        isMinor: true,
        photoStorageKey: true,
      },
    });

    const hits = rows
      .map((person) => {
        const scored = scorePersonDedupeMatch({ q: query }, person);
        if (scored.score <= 0) {
          // Prisma contains pode achar substring que o scorer ignora — fallback leve
          const qLower = query.toLowerCase();
          const reasons: PersonDedupeMatchReason[] = [];
          if (person.displayName.toLowerCase().includes(qLower)) {
            reasons.push("displayName");
          }
          if (person.email?.toLowerCase().includes(qLower)) {
            reasons.push("email");
          }
          if (reasons.length === 0) return null;
          return {
            person: this.toSummary(person),
            score: reasons.length > 1 ? 0.85 : 0.7,
            matchReasons: reasons,
          };
        }
        return {
          person: this.toSummary(person),
          score: scored.score,
          matchReasons: scored.matchReasons,
        };
      })
      .filter((h): h is NonNullable<typeof h> => h !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, take);

    return { query, hits, autoMergeForbidden: true as const };
  }

  /**
   * Pré-checagem de duplicidade (RF-001) — candidatos ranqueados, sem merge.
   * FE deve chamar antes de POST /admissions com displayName novo.
   */
  async findCandidates(
    actor: AuthUser,
    input: { displayName: string; email?: string; limit?: number },
  ) {
    const pilot = await this.pilot.getPilotChurch();
    if (
      !canSearchPersons(actor.grants, {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      })
    ) {
      throw new ForbiddenException("Sem permissão para buscar pessoas");
    }

    const displayName = input.displayName?.trim() ?? "";
    const email = input.email?.trim().toLowerCase() || null;
    if (displayName.length < 2 && !email) {
      throw new BadRequestException(
        "Informe displayName (mín. 2) ou email para buscar candidatos",
      );
    }

    const take = Math.min(Math.max(input.limit ?? 10, 1), 50);
    const orFilters: Array<Record<string, unknown>> = [];
    if (displayName.length >= 2) {
      orFilters.push({
        displayName: { contains: displayName, mode: "insensitive" },
      });
      const tokens = displayName.split(/\s+/).filter((t) => t.length >= 3);
      for (const token of tokens.slice(0, 4)) {
        orFilters.push({
          displayName: { contains: token, mode: "insensitive" },
        });
      }
    }
    if (email) {
      orFilters.push({ email: { equals: email, mode: "insensitive" } });
      orFilters.push({ email: { contains: email, mode: "insensitive" } });
    }

    const rows = await this.prisma.person.findMany({
      where: {
        organizationId: pilot.organizationId,
        OR: orFilters.length > 0 ? orFilters : undefined,
      },
      take: Math.min(take * 4, 200),
      orderBy: { displayName: "asc" },
      select: {
        id: true,
        displayName: true,
        email: true,
        status: true,
        householdId: true,
        kind: true,
        isMinor: true,
        photoStorageKey: true,
      },
    });

    const hits = rows
      .map((person) => {
        const scored = scorePersonDedupeMatch(
          { displayName, email: email ?? undefined },
          person,
        );
        if (scored.score <= 0) return null;
        return {
          person: this.toSummary(person),
          score: scored.score,
          matchReasons: scored.matchReasons,
        };
      })
      .filter((h): h is NonNullable<typeof h> => h !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, take);

    const strongMatch = hits.some((h) =>
      isStrongPersonDedupeMatch(h.score, h.matchReasons),
    );

    return {
      query: { displayName, email },
      hits,
      strongMatch,
      autoMergeForbidden: true as const,
    };
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
        photoStorageKey: true,
      },
    });
    if (!person) {
      throw new NotFoundException("Pessoa não encontrada neste escopo");
    }
    return {
      ...this.toSummary(person),
      legalGuardianPersonId: person.legalGuardianPersonId,
    };
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
        photoStorageKey: true,
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
        ...this.toSummary(person),
        email: isStaff || actor.personId === person.id ? person.email : null,
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
        photoStorageKey: true,
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

    return {
      ...this.toSummary(updated),
      legalGuardianPersonId: updated.legalGuardianPersonId,
    };
  }

  private toSummary(person: {
    id: string;
    displayName: string;
    email: string | null;
    status: string;
    householdId: string | null;
    kind: string;
    isMinor: boolean;
    photoStorageKey?: string | null;
  }) {
    return {
      id: person.id,
      displayName: person.displayName,
      email: person.email,
      status: person.status,
      householdId: person.householdId,
      kind: person.kind,
      isMinor: person.isMinor,
      photo: this.toPhotoStub(person.photoStorageKey),
    };
  }

  private toPhotoStub(photoStorageKey?: string | null): PersonPhotoStubDto {
    const has = Boolean(photoStorageKey);
    return {
      status: has ? "READY" : "NONE",
      hasStorageKey: has,
    };
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
