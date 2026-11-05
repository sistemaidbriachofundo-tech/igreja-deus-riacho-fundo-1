import { Injectable, NotFoundException } from "@nestjs/common";
import { PILOT_CHURCH_NAME } from "@idbrf/shared";
import { PrismaService } from "../prisma/prisma.service";
import { PilotService } from "../pilot/pilot.service";

/**
 * Superfície pública do portal — só conteúdo PUBLISHED / PUBLIC.
 * Sem pastoral, telefone, menor, família ou documentos.
 */
@Injectable()
export class PublicPortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pilot: PilotService,
  ) {}

  async home() {
    const pilot = await this.pilot.getPilotChurch();
    const [ministries, featuredEvents] = await Promise.all([
      this.prisma.ministry.findMany({
        where: {
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          publishStatus: "PUBLISHED",
          visibility: "PUBLIC",
        },
        orderBy: { name: "asc" },
        take: 12,
      }),
      this.prisma.portalEvent.findMany({
        where: {
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          status: "PUBLISHED",
          featuredOnHome: true,
        },
        orderBy: { startsAt: "asc" },
        take: 6,
      }),
    ]);

    return {
      church: {
        id: pilot.churchId,
        name: pilot.churchName || PILOT_CHURCH_NAME,
        slug: pilot.churchSlug,
      },
      ministries: ministries.map((m) => this.toPublicMinistrySummary(m)),
      featuredEvents: featuredEvents.map((e) => this.toPublicEvent(e)),
      contentBlocks: [],
      notes: [
        "Stub /public/home — blocos CMS (banners/notícias) entram na Frente D",
        "Sem PII pastoral/família/telefone",
      ],
    };
  }

  async listMinistries() {
    const pilot = await this.pilot.getPilotChurch();
    const rows = await this.prisma.ministry.findMany({
      where: {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        publishStatus: "PUBLISHED",
        visibility: "PUBLIC",
      },
      orderBy: { name: "asc" },
    });
    return {
      churchId: pilot.churchId,
      ministries: rows.map((m) => this.toPublicMinistrySummary(m)),
    };
  }

  async getMinistryBySlug(slug: string) {
    const pilot = await this.pilot.getPilotChurch();
    const ministry = await this.prisma.ministry.findFirst({
      where: {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        slug: slug.trim().toLowerCase(),
        publishStatus: "PUBLISHED",
        visibility: "PUBLIC",
      },
    });
    if (!ministry) {
      throw new NotFoundException("Ministério público não encontrado");
    }

    const relatedEvents = await this.prisma.portalEvent.findMany({
      where: {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        ministryId: ministry.id,
        status: "PUBLISHED",
      },
      orderBy: { startsAt: "asc" },
      take: 12,
    });

    return {
      ...this.toPublicMinistryDetail(ministry),
      relatedEvents: relatedEvents.map((e) => this.toPublicEvent(e)),
      relatedContent: [],
    };
  }

  async listEvents() {
    const pilot = await this.pilot.getPilotChurch();
    const rows = await this.prisma.portalEvent.findMany({
      where: {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        status: "PUBLISHED",
      },
      orderBy: { startsAt: "asc" },
    });
    return {
      churchId: pilot.churchId,
      events: rows.map((e) => this.toPublicEvent(e)),
    };
  }

  async getEventBySlug(slug: string) {
    const pilot = await this.pilot.getPilotChurch();
    const event = await this.prisma.portalEvent.findFirst({
      where: {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        slug: slug.trim().toLowerCase(),
        status: "PUBLISHED",
      },
    });
    if (!event) {
      throw new NotFoundException("Evento público não encontrado");
    }
    return this.toPublicEvent(event);
  }

  private toPublicMinistrySummary(row: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    coverImageUrl: string | null;
  }) {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      coverImageUrl: row.coverImageUrl,
    };
  }

  private toPublicMinistryDetail(row: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    coverImageUrl: string | null;
    galleryUrls: string[];
    scheduleText: string | null;
    leadershipPublic: unknown;
    participationInfo: string | null;
    publishedAt: Date | null;
  }) {
    return {
      ...this.toPublicMinistrySummary(row),
      galleryUrls: row.galleryUrls ?? [],
      scheduleText: row.scheduleText,
      leadership: Array.isArray(row.leadershipPublic)
        ? row.leadershipPublic
        : [],
      participationInfo: row.participationInfo,
      publishedAt: row.publishedAt?.toISOString() ?? null,
    };
  }

  private toPublicEvent(row: {
    id: string;
    ministryId: string | null;
    name: string;
    slug: string;
    description: string | null;
    imageUrl: string | null;
    startsAt: Date;
    endsAt: Date | null;
    locationText: string | null;
    featuredOnHome: boolean;
  }) {
    return {
      id: row.id,
      ministryId: row.ministryId,
      name: row.name,
      slug: row.slug,
      description: row.description,
      imageUrl: row.imageUrl,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt?.toISOString() ?? null,
      locationText: row.locationText,
      featuredOnHome: row.featuredOnHome,
    };
  }
}
