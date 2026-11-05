import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import {
  canAdministerMinistries,
  canManageSpecificMinistry,
} from "@idbrf/shared";
import type { AuthUser } from "../auth/types/auth-user";
import type { PrismaService } from "../prisma/prisma.service";

export type PilotScope = { organizationId: string; churchId: string };

/** Secretaria/pastor/admin ou líder do ministryId informado. */
export function assertMinistryScopedWrite(
  actor: AuthUser,
  pilot: PilotScope,
  ministryId: string | null,
  messages: { missingMinistry: string; forbidden: string },
): void {
  if (canAdministerMinistries(actor.grants, pilot)) {
    return;
  }
  if (!ministryId) {
    throw new ForbiddenException(messages.missingMinistry);
  }
  if (
    !canManageSpecificMinistry(actor.grants, actor.personId, {
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      ministryId,
    })
  ) {
    throw new ForbiddenException(messages.forbidden);
  }
}

export function filterRowsForMinistryLeader<
  T extends { ministryId: string | null },
>(rows: T[], actor: AuthUser, pilot: PilotScope): T[] {
  if (canAdministerMinistries(actor.grants, pilot)) {
    return rows;
  }
  return rows.filter((row) =>
    row.ministryId
      ? canManageSpecificMinistry(actor.grants, actor.personId, {
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          ministryId: row.ministryId,
        })
      : false,
  );
}

export async function requireMinistryInPilot(
  prisma: PrismaService,
  ministryId: string,
  pilot: PilotScope,
  notFoundAs: "badRequest" | "notFound" = "badRequest",
) {
  const ministry = await prisma.ministry.findFirst({
    where: {
      id: ministryId,
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
    },
  });
  if (!ministry) {
    if (notFoundAs === "notFound") {
      throw new NotFoundException("Ministério não encontrado");
    }
    throw new BadRequestException("Ministério não encontrado neste escopo");
  }
  return ministry;
}

export function actorIsMinistryLeader(
  actor: AuthUser,
  pilot: PilotScope,
): boolean {
  return actor.grants.some(
    (g) =>
      g.roleCode === "LIDER_MINISTERIO" &&
      (!g.organizationId || g.organizationId === pilot.organizationId) &&
      (!g.churchId || g.churchId === pilot.churchId),
  );
}
