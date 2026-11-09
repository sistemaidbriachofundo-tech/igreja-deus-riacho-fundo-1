import { Injectable, NotFoundException } from "@nestjs/common";
import { PILOT_CHURCH_NAME } from "@idbrf/shared";
import { PrismaService } from "../prisma/prisma.service";
import { PilotService } from "../pilot/pilot.service";
import { RESERVED_SITE_SLUGS } from "../cms/site-layout.service";

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
    const [ministries, featuredEvents, homeBlocks, banners] =
      await Promise.all([
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
        this.prisma.cmsContent.findMany({
          where: {
            organizationId: pilot.organizationId,
            churchId: pilot.churchId,
            status: "PUBLICADO",
            kind: { in: ["HOME_BLOCK", "NEWS"] },
            slug: { notIn: [...RESERVED_SITE_SLUGS] },
          },
          orderBy: [{ sortOrder: "asc" }, { publishedAt: "desc" }],
          take: 12,
        }),
        this.prisma.cmsContent.findMany({
          where: {
            organizationId: pilot.organizationId,
            churchId: pilot.churchId,
            status: "PUBLICADO",
            kind: "BANNER",
            slug: { notIn: [...RESERVED_SITE_SLUGS] },
          },
          orderBy: [{ sortOrder: "asc" }],
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
      contentBlocks: homeBlocks.map((c) => this.toPublicContent(c)),
      banners: banners.map((c) => this.toPublicContent(c)),
      notes: ["Sem PII pastoral/família/telefone na superfície pública"],
    };
  }

  async getContentBySlug(slug: string) {
    const pilot = await this.pilot.getPilotChurch();
    const normalized = slug.trim().toLowerCase();
    if (RESERVED_SITE_SLUGS.includes(normalized as (typeof RESERVED_SITE_SLUGS)[number])) {
      throw new NotFoundException("Conteúdo público não encontrado");
    }
    const row = await this.prisma.cmsContent.findFirst({
      where: {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        slug: normalized,
        status: "PUBLICADO",
        NOT: { slug: { in: [...RESERVED_SITE_SLUGS] } },
      },
    });
    if (!row) {
      throw new NotFoundException("Conteúdo público não encontrado");
    }
    return this.toPublicContent(row);
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

    const [relatedEvents, relatedContent] = await Promise.all([
      this.prisma.portalEvent.findMany({
        where: {
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          ministryId: ministry.id,
          status: "PUBLISHED",
        },
        orderBy: { startsAt: "asc" },
        take: 12,
      }),
      this.prisma.cmsContent.findMany({
        where: {
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          ministryId: ministry.id,
          status: "PUBLICADO",
          kind: "MINISTRY_CONTENT",
        },
        orderBy: [{ sortOrder: "asc" }],
        take: 12,
      }),
    ]);

    return {
      ...this.toPublicMinistryDetail(ministry),
      relatedEvents: relatedEvents.map((e) => this.toPublicEvent(e)),
      relatedContent: relatedContent.map((c) => this.toPublicContent(c)),
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

  private toPublicContent(row: {
    id: string;
    kind: string;
    slug: string;
    title: string;
    summary: string | null;
    body: string | null;
    imageUrl: string | null;
    ministryId: string | null;
    sortOrder: number;
    publishedAt: Date | null;
  }) {
    return {
      id: row.id,
      kind: row.kind,
      slug: row.slug,
      title: row.title,
      summary: row.summary,
      body: row.body,
      imageUrl: row.imageUrl,
      ministryId: row.ministryId,
      sortOrder: row.sortOrder,
      publishedAt: row.publishedAt?.toISOString() ?? null,
    };
  }
}
