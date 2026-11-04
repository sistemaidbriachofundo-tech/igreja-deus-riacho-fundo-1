import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { canManageMemberships } from "@idbrf/shared";
import type { AuthUser } from "../auth/types/auth-user";
import { PrismaService } from "../prisma/prisma.service";
import { PilotService } from "../pilot/pilot.service";

@Injectable()
export class HouseholdsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pilot: PilotService,
  ) {}

  async create(
    actor: AuthUser,
    input: { label?: string; memberPersonIds?: string[] },
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

    const memberIds = [...new Set(input.memberPersonIds ?? [])];

    return this.prisma.$transaction(async (tx) => {
      if (memberIds.length) {
        const found = await tx.person.findMany({
          where: {
            id: { in: memberIds },
            organizationId: pilot.organizationId,
          },
          select: { id: true, isMinor: true, legalGuardianPersonId: true },
        });
        if (found.length !== memberIds.length) {
          throw new BadRequestException(
            "Uma ou mais pessoas não existem neste escopo",
          );
        }
        for (const p of found) {
          if (p.isMinor && !p.legalGuardianPersonId) {
            throw new BadRequestException(
              `Menor ${p.id} exige responsável legal antes de vincular à família`,
            );
          }
        }
      }

      const household = await tx.household.create({
        data: {
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          label: input.label?.trim() || null,
        },
      });

      if (memberIds.length) {
        await tx.person.updateMany({
          where: { id: { in: memberIds } },
          data: { householdId: household.id },
        });
      }

      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "household.create",
          resourceType: "household",
          resourceId: household.id,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: { memberPersonIds: memberIds },
        },
      });

      return {
        id: household.id,
        label: household.label,
        churchId: household.churchId,
        organizationId: household.organizationId,
        memberPersonIds: memberIds,
        createdAt: household.createdAt.toISOString(),
      };
    });
  }

  async getById(actor: AuthUser, householdId: string) {
    const pilot = await this.pilot.getPilotChurch();
    if (
      !canManageMemberships(actor.grants, {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      })
    ) {
      throw new ForbiddenException("Sem permissão nesta congregação");
    }

    const household = await this.prisma.household.findFirst({
      where: {
        id: householdId,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      },
      include: {
        persons: { select: { id: true } },
      },
    });
    if (!household) {
      throw new NotFoundException("Família não encontrada");
    }

    return {
      id: household.id,
      label: household.label,
      churchId: household.churchId,
      organizationId: household.organizationId,
      memberPersonIds: household.persons.map((p) => p.id),
      createdAt: household.createdAt.toISOString(),
    };
  }
}
