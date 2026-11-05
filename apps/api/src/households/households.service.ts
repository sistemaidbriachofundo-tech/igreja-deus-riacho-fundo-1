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

  async list(actor: AuthUser) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertManage(actor, pilot.organizationId, pilot.churchId);

    const rows = await this.prisma.household.findMany({
      where: {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      },
      orderBy: { createdAt: "desc" },
      include: {
        persons: { select: { id: true, displayName: true, isMinor: true } },
      },
    });

    return {
      churchId: pilot.churchId,
      households: rows.map((household) => this.toDto(household)),
    };
  }

  async getById(actor: AuthUser, householdId: string) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertManage(actor, pilot.organizationId, pilot.churchId);

    const household = await this.prisma.household.findFirst({
      where: {
        id: householdId,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      },
      include: {
        persons: { select: { id: true, displayName: true, isMinor: true } },
      },
    });
    if (!household) {
      throw new NotFoundException("Família não encontrada");
    }

    return this.toDto(household);
  }

  async addMembers(
    actor: AuthUser,
    householdId: string,
    memberPersonIds: string[],
  ) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertManage(actor, pilot.organizationId, pilot.churchId);
    const household = await this.requireHousehold(householdId, pilot);
    const ids = [...new Set(memberPersonIds)];
    if (!ids.length) {
      throw new BadRequestException("Informe memberPersonIds");
    }

    await this.prisma.$transaction(async (tx) => {
      const found = await tx.person.findMany({
        where: {
          id: { in: ids },
          organizationId: pilot.organizationId,
        },
        select: { id: true, isMinor: true, legalGuardianPersonId: true },
      });
      if (found.length !== ids.length) {
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
      await tx.person.updateMany({
        where: { id: { in: ids } },
        data: { householdId: household.id },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "household.add_members",
          resourceType: "household",
          resourceId: household.id,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: { memberPersonIds: ids },
        },
      });
    });
    return this.getById(actor, household.id);
  }

  async removeMember(actor: AuthUser, householdId: string, personId: string) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertManage(actor, pilot.organizationId, pilot.churchId);
    await this.requireHousehold(householdId, pilot);

    const person = await this.prisma.person.findFirst({
      where: {
        id: personId,
        organizationId: pilot.organizationId,
        householdId,
      },
    });
    if (!person) {
      throw new NotFoundException("Pessoa não está nesta família");
    }

    await this.prisma.person.update({
      where: { id: personId },
      data: { householdId: null },
    });
    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.userId,
        action: "household.remove_member",
        resourceType: "household",
        resourceId: householdId,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        metadata: { personId },
      },
    });
    return this.getById(actor, householdId);
  }

  private assertManage(
    actor: AuthUser,
    organizationId: string,
    churchId: string,
  ): void {
    if (!canManageMemberships(actor.grants, { organizationId, churchId })) {
      throw new ForbiddenException("Sem permissão nesta congregação");
    }
  }

  private async requireHousehold(
    householdId: string,
    pilot: { organizationId: string; churchId: string },
  ) {
    const household = await this.prisma.household.findFirst({
      where: {
        id: householdId,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      },
    });
    if (!household) {
      throw new NotFoundException("Família não encontrada");
    }
    return household;
  }

  private toDto(household: {
    id: string;
    label: string | null;
    churchId: string;
    organizationId: string;
    createdAt: Date;
    persons: Array<{ id: string; displayName: string; isMinor: boolean }>;
  }) {
    return {
      id: household.id,
      label: household.label,
      churchId: household.churchId,
      organizationId: household.organizationId,
      memberPersonIds: household.persons.map((p) => p.id),
      members: household.persons.map((p) => ({
        id: p.id,
        displayName: p.displayName,
        isMinor: p.isMinor,
      })),
      createdAt: household.createdAt.toISOString(),
    };
  }
}
