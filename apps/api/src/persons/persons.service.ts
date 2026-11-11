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
import { BusinessException } from "../common/business.exception";
import { PrismaService } from "../prisma/prisma.service";
import { PilotService } from "../pilot/pilot.service";
import {
  collectNameDedupeAlerts,
  normalizeDisplayName,
  normalizePersonEmail,
  parseExpectedUpdatedAt,
  rejectPersonPatchPolicy,
  type CadastralPersonPatch,
} from "./cadastral-patch";

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
        address: true,
        status: true,
        householdId: true,
        kind: true,
        isMinor: true,
        legalGuardianPersonId: true,
        photoStorageKey: true,
        updatedAt: true,
      },
    });
    if (!person) {
      throw new NotFoundException("Pessoa não encontrada neste escopo");
    }
    return {
      ...this.toSummary(person),
      address: person.address ?? null,
      legalGuardianPersonId: person.legalGuardianPersonId,
      ...this.updatedAtField(person.updatedAt),
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
        address: true,
        status: true,
        kind: true,
        isMinor: true,
        householdId: true,
        legalGuardianPersonId: true,
        photoStorageKey: true,
        updatedAt: true,
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
            updatedAt: true,
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
        address: person.address ?? null,
        legalGuardianPersonId: person.legalGuardianPersonId,
        ...this.updatedAtField(person.updatedAt),
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
        ...this.updatedAtField(m.updatedAt),
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

  async patch(actor: AuthUser, personId: string, input: CadastralPersonPatch) {
    const pilot = await this.pilot.getPilotChurch();
    if (
      !canManageMemberships(actor.grants, {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      })
    ) {
      throw new ForbiddenException("Sem permissão de secretaria nesta congregação");
    }
    rejectPersonPatchPolicy(input);

    return this.prisma.$transaction(async (tx) => {
      const person = await tx.person.findFirst({
        where: { id: personId, organizationId: pilot.organizationId },
      });
      if (!person) {
        throw new NotFoundException("Pessoa não encontrada neste escopo");
      }

      if (input.expectedUpdatedAt !== undefined) {
        const expected = parseExpectedUpdatedAt(input.expectedUpdatedAt);
        if (
          !(person.updatedAt instanceof Date) ||
          person.updatedAt.getTime() !== expected.getTime()
        ) {
          throw new BusinessException(
            "A ficha foi alterada por outra gravação. Reabra antes de salvar.",
            "PERSON_VERSION_CONFLICT",
            409,
          );
        }
      }

      const data: {
        displayName?: string;
        email?: string | null;
        address?: string | null;
        isMinor?: boolean;
        legalGuardianPersonId?: string | null;
        householdId?: string | null;
      } = {};

      if (input.displayName !== undefined) {
        const displayName = normalizeDisplayName(input.displayName);
        if (displayName !== person.displayName) {
          data.displayName = displayName;
        }
      }

      if (input.email !== undefined) {
        const email = normalizePersonEmail(input.email);
        if (email !== person.email) {
          data.email = email;
        }
      }

      if (input.address !== undefined) {
        const address = input.address?.trim() || null;
        if (address && address.length > 500) {
          throw new BadRequestException("O endereço pode ter até 500 caracteres.");
        }
        if (address !== (person.address ?? null)) data.address = address;
      }

      if (input.isMinor !== undefined && input.isMinor !== person.isMinor) {
        data.isMinor = input.isMinor;
      }

      if (input.legalGuardianPersonId !== undefined) {
        const guardianId = input.legalGuardianPersonId;
        if (guardianId !== null && guardianId.trim() === "") {
          throw new BusinessException(
            "Responsável legal inválido.",
            "PERSON_GUARDIAN_INVALID",
            400,
          );
        }
        if (guardianId === personId) {
          throw new BadRequestException(
            "Responsável legal não pode ser a própria pessoa",
          );
        }
        if (guardianId) {
          const guardian = await tx.person.findFirst({
            where: {
              id: guardianId,
              organizationId: pilot.organizationId,
              isMinor: false,
            },
            select: { id: true, legalGuardianPersonId: true },
          });
          if (!guardian) {
            throw new BadRequestException(
              "Responsável legal deve ser pessoa adulta existente no piloto",
            );
          }
          await this.assertGuardianChain(
            tx,
            pilot.organizationId,
            personId,
            guardian,
          );
        }
        if (guardianId !== person.legalGuardianPersonId) {
          data.legalGuardianPersonId = guardianId;
        }
      }

      if (input.householdId !== undefined) {
        if (input.householdId !== null && input.householdId.trim() === "") {
          throw new BusinessException(
            "Família inválida.",
            "PERSON_HOUSEHOLD_INVALID",
            400,
          );
        }
        if (input.householdId) {
          const hh = await tx.household.findFirst({
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
        if (input.householdId !== person.householdId) {
          data.householdId = input.householdId;
        }
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

      if (data.isMinor === true) {
        const dependents = await tx.person.count({
          where: {
            legalGuardianPersonId: personId,
            organizationId: pilot.organizationId,
          },
        });
        if (dependents > 0) {
          throw new BusinessException(
            "Pessoa responsável por outras não pode ser marcada como menor.",
            "PERSON_HAS_DEPENDENTS",
            400,
          );
        }
      }

      const fields = Object.keys(data);
      if (fields.length === 0) {
        return this.toPatchResult(person, []);
      }

      if (
        !(person.updatedAt instanceof Date) ||
        Number.isNaN(person.updatedAt.getTime())
      ) {
        throw new BusinessException(
          "Concorrência otimista indisponível: a pessoa não tem updatedAt.",
          "PERSON_VERSION_UNSUPPORTED",
          409,
        );
      }

      const dedupeAlerts = await this.assertPersonDedupe(
        tx,
        pilot.organizationId,
        personId,
        data.displayName,
        data.email,
      );

      const written = await tx.person.updateMany({
        where: {
          id: personId,
          organizationId: pilot.organizationId,
          updatedAt: person.updatedAt,
        },
        data,
      });
      if (written.count !== 1) {
        throw new BusinessException(
          "A ficha foi alterada por outra gravação. Reabra antes de salvar.",
          "PERSON_VERSION_CONFLICT",
          409,
        );
      }

      const updated = await tx.person.findFirst({
        where: { id: personId, organizationId: pilot.organizationId },
        select: {
          id: true,
          displayName: true,
          email: true,
          address: true,
          status: true,
          householdId: true,
          kind: true,
          isMinor: true,
          legalGuardianPersonId: true,
          photoStorageKey: true,
          updatedAt: true,
        },
      });
      if (!updated) {
        throw new NotFoundException("Pessoa não encontrada neste escopo");
      }

      const before: { [key: string]: string | boolean | null } = {};
      const after: { [key: string]: string | boolean | null } = {};
      for (const field of fields) {
        before[field] = field === "address" ? Boolean(person.address) : jsonSnapshot(person[field as keyof typeof person]);
        after[field] = field === "address" ? Boolean(updated.address) : jsonSnapshot(updated[field as keyof typeof updated]);
      }

      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "person.patch",
          resourceType: "person",
          resourceId: personId,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: {
            fields,
            before,
            after,
            isMinor: updated.isMinor,
            hasGuardian: Boolean(updated.legalGuardianPersonId),
            dedupeAlertPersonIds: dedupeAlerts.map((alert) => alert.personId),
          },
        },
      });

      return this.toPatchResult(updated, dedupeAlerts);
    });
  }

  private async assertGuardianChain(
    tx: {
      person: {
        findFirst: (args: {
          where: { id: string; organizationId: string };
          select: { legalGuardianPersonId: true };
        }) => Promise<{ legalGuardianPersonId: string | null } | null>;
      };
    },
    organizationId: string,
    personId: string,
    guardian: { id: string; legalGuardianPersonId: string | null },
  ) {
    let cursor: string | null = guardian.legalGuardianPersonId;
    const seen = new Set<string>([personId, guardian.id]);
    for (let depth = 0; depth < 8 && cursor; depth += 1) {
      if (cursor === personId) {
        throw new BusinessException(
          "Responsável legal não pode formar ciclo com esta pessoa.",
          "PERSON_GUARDIAN_CYCLE",
          400,
        );
      }
      if (seen.has(cursor)) return;
      seen.add(cursor);
      const next = await tx.person.findFirst({
        where: { id: cursor, organizationId },
        select: { legalGuardianPersonId: true },
      });
      cursor = next?.legalGuardianPersonId ?? null;
    }
  }

  private async assertPersonDedupe(
    tx: {
      person: {
        findMany: (args: {
          where: {
            organizationId: string;
            id: { not: string };
            OR: Array<Record<string, unknown>>;
          };
          select: { id: true; displayName: true; email: true };
          take: number;
        }) => Promise<
          Array<{ id: string; displayName: string; email: string | null }>
        >;
      };
    },
    organizationId: string,
    personId: string,
    displayName: string | undefined,
    email: string | null | undefined,
  ) {
    const or: Array<Record<string, unknown>> = [];
    if (displayName) {
      or.push({ displayName: { equals: displayName, mode: "insensitive" } });
    }
    if (typeof email === "string") {
      or.push({ email: { equals: email, mode: "insensitive" } });
    }
    if (or.length === 0) return [];

    const rows = await tx.person.findMany({
      where: {
        organizationId,
        id: { not: personId },
        OR: or,
      },
      select: { id: true, displayName: true, email: true },
      take: 20,
    });

    if (typeof email === "string") {
      const clash = rows.find(
        (row) => row.email?.trim().toLowerCase() === email,
      );
      if (clash) {
        throw new BusinessException(
          "Já existe outra pessoa nesta organização com este e-mail.",
          "PERSON_EMAIL_DUPLICATE",
          409,
        );
      }
    }

    if (!displayName) return [];
    return collectNameDedupeAlerts(displayName, rows);
  }

  private toPatchResult(
    person: {
      id: string;
      displayName: string;
      email: string | null;
      address?: string | null;
      status: string;
      householdId: string | null;
      kind: string;
      isMinor: boolean;
      legalGuardianPersonId: string | null;
      photoStorageKey?: string | null;
      updatedAt?: Date;
    },
    dedupeAlerts: Array<{
      personId: string;
      matchReasons: ["normalizedDisplayName"];
    }>,
  ) {
    return {
      ...this.toSummary(person),
      address: person.address ?? null,
      legalGuardianPersonId: person.legalGuardianPersonId,
      ...this.updatedAtField(person.updatedAt),
      dedupeAlerts,
    };
  }

  private updatedAtField(value: Date | null | undefined) {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      return {};
    }
    return { updatedAt: value.toISOString() };
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

function jsonSnapshot(value: unknown): string | boolean | null {
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (value == null) return null;
  return String(value);
}
