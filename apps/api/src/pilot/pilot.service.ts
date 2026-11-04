import { Injectable, NotFoundException } from "@nestjs/common";
import { PILOT_CHURCH_SLUG, PILOT_ORG_SLUG } from "@idbrf/shared";
import { PrismaService } from "../prisma/prisma.service";

export interface PilotChurch {
  organizationId: string;
  churchId: string;
  organizationSlug: string;
  churchSlug: string;
  churchName: string;
}

/**
 * Resolve a congregação piloto (Riacho Fundo I).
 * Hard-scope: sem multi-congregação neste slice.
 */
@Injectable()
export class PilotService {
  constructor(private readonly prisma: PrismaService) {}

  async getPilotChurch(): Promise<PilotChurch> {
    const org = await this.prisma.organization.findUnique({
      where: { slug: PILOT_ORG_SLUG },
    });
    if (!org) {
      throw new NotFoundException("Organização piloto não encontrada (rode o seed)");
    }

    const church = await this.prisma.church.findUnique({
      where: {
        organizationId_slug: {
          organizationId: org.id,
          slug: PILOT_CHURCH_SLUG,
        },
      },
    });
    if (!church) {
      throw new NotFoundException(
        "Igreja piloto Riacho Fundo I não encontrada (rode o seed)",
      );
    }

    return {
      organizationId: org.id,
      churchId: church.id,
      organizationSlug: org.slug,
      churchSlug: church.slug,
      churchName: church.name,
    };
  }
}
