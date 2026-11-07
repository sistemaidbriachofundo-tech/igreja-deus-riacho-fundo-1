import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { canManageMemberships } from "@idbrf/shared";
import type { AuthUser } from "../auth/types/auth-user";
import { PrismaService } from "../prisma/prisma.service";
import { PilotService } from "../pilot/pilot.service";

export interface RegisterMembershipInput {
  displayName: string;
  email?: string;
  notes?: string;
  householdLabel?: string;
  /** Se informado, vincula pessoa existente; senão cria pessoa fictícia. */
  personId?: string;
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
