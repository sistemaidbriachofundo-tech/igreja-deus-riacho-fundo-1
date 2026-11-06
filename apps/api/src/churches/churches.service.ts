import { ForbiddenException, Injectable } from "@nestjs/common";
import {
  canAccessChurch,
  explicitChurchIdsFromGrants,
  hasOrgWideGrant,
  organizationIdsFromGrants,
  PILOT_CHURCH_SLUG,
} from "@idbrf/shared";
import type { AuthUser } from "../auth/types/auth-user";
import { PrismaService } from "../prisma/prisma.service";
import { PilotService } from "../pilot/pilot.service";

@Injectable()
export class ChurchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pilot: PilotService,
  ) {}

  /**
   * Lista congregações cobertas pelos grants do ator.
   * Produto default = RF1 (`isPilotDefault`); multi-igreja via grants.
   */
  async listAccessible(actor: AuthUser) {
    const pilot = await this.pilot.getPilotChurch();
    const orgIds = organizationIdsFromGrants(actor.grants);

    // Grant plataforma sem org → org piloto
    const organizationId =
      actor.organizationId ??
      orgIds[0] ??
      (actor.grants.length ? pilot.organizationId : null);

    if (!organizationId) {
      throw new ForbiddenException("Sem organização no escopo do token");
    }

    const orgWide = hasOrgWideGrant(actor.grants, organizationId);
    const explicitIds = explicitChurchIdsFromGrants(
      actor.grants,
      organizationId,
    );

    const churches = await this.prisma.church.findMany({
      where: {
        organizationId,
        ...(orgWide ? {} : { id: { in: explicitIds } }),
      },
      orderBy: { name: "asc" },
    });

    const visible = churches.filter(
      (c: { id: string; organizationId: string; slug: string; name: string }) =>
        canAccessChurch(actor.grants, {
          organizationId: c.organizationId,
          churchId: c.id,
        }),
    );

    return {
      organizationId,
      defaultChurchId: pilot.churchId,
      churches: visible.map(
        (c: { id: string; organizationId: string; slug: string; name: string }) => ({
          id: c.id,
          organizationId: c.organizationId,
          slug: c.slug,
          name: c.name,
          isPilotDefault: c.slug === PILOT_CHURCH_SLUG,
        }),
      ),
    };
  }
}
