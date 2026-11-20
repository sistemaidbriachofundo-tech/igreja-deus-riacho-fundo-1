import { Injectable } from "@nestjs/common";
import { normalizeResumeEventSlug } from "@idbrf/shared";
import { PrismaService } from "../prisma/prisma.service";
import { PilotService } from "../pilot/pilot.service";

@Injectable()
export class ResumeEventService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pilot: PilotService,
  ) {}

  async resolve(slug: string | null | undefined): Promise<{ eventSlug: string } | null> {
    const normalized = normalizeResumeEventSlug(slug);
    if (!normalized) return null;
    const { organizationId, churchId } = await this.pilot.getPilotChurch();
    const event = await this.prisma.portalEvent.findFirst({
      where: { organizationId, churchId, slug: normalized, status: "PUBLISHED" },
      select: { slug: true },
    });
    return event ? { eventSlug: event.slug } : null;
  }
}
