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
 * Produto default single-church = RF1. F6: multi-igreja via grants + /churches.
 */
@Injectable()
export class PilotService {
  private resolved?: { scope: PilotChurch; expiresAt: number };
  private pending?: Promise<PilotChurch>;

  constructor(private readonly prisma: PrismaService) {}

  async getPilotChurch(): Promise<PilotChurch> {
    if (this.resolved && Date.now() < this.resolved.expiresAt) {
      return { ...this.resolved.scope };
    }
    this.pending ??= this.loadPilotChurch().then(scope => {
      this.resolved = { scope, expiresAt: Date.now() + 30_000 };
      return scope;
    }).finally(() => {
      this.pending = undefined;
    });
    return { ...(await this.pending) };
  }

  private async loadPilotChurch(): Promise<PilotChurch> {
    const org = await this.prisma.organization.findUnique({
      where: { slug: PILOT_ORG_SLUG },
      select: { id: true, slug: true },
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
      select: { id: true, slug: true, name: true },
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
