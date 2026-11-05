import { NotFoundException } from "@nestjs/common";
import { PublicPortalService } from "./public-portal.service";

describe("PublicPortalService", () => {
  const pilot = {
    organizationId: "org1",
    churchId: "church-rf1",
    organizationSlug: "igreja-de-deus",
    churchSlug: "riacho-fundo-1",
    churchName: "Riacho Fundo I (demo)",
  };

  const ministry = {
    id: "m-jovens",
    name: "Jovens",
    slug: "jovens",
    description: "demo",
    coverImageUrl: "/img.jpg",
    galleryUrls: ["/g1.jpg"],
    scheduleText: "Sáb 19h",
    leadershipPublic: [{ displayName: "Líder", roleTitle: "Coord" }],
    participationInfo: "Venha",
    publishedAt: new Date("2026-11-05T12:00:00Z"),
  };

  const event = {
    id: "e1",
    ministryId: "m-jovens",
    name: "Encontro",
    slug: "encontro-jovens-demo",
    description: "demo",
    imageUrl: null,
    startsAt: new Date("2026-11-15T22:00:00Z"),
    endsAt: null,
    locationText: "Salão",
    featuredOnHome: true,
  };

  const cmsBlock = {
    id: "c1",
    kind: "HOME_BLOCK",
    slug: "home-boas-vindas",
    title: "Bem-vindo",
    summary: "demo",
    body: "texto",
    imageUrl: null,
    ministryId: null,
    sortOrder: 1,
    publishedAt: new Date("2026-11-05T12:00:00Z"),
  };

  it("home returns published ministries, featured events and CMS blocks", async () => {
    const banner = {
      ...cmsBlock,
      id: "b1",
      kind: "BANNER",
      slug: "banner-capa",
      title: "Capa",
    };
    const prisma = {
      ministry: { findMany: jest.fn().mockResolvedValue([ministry]) },
      portalEvent: { findMany: jest.fn().mockResolvedValue([event]) },
      cmsContent: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([cmsBlock])
          .mockResolvedValueOnce([banner]),
      },
    };
    const service = new PublicPortalService(
      prisma as never,
      {
        getPilotChurch: jest.fn().mockResolvedValue({
          ...pilot,
          churchName: "",
        }),
      } as never,
    );
    const home = await service.home();
    expect(home.ministries).toHaveLength(1);
    expect(home.featuredEvents[0].slug).toBe("encontro-jovens-demo");
    expect(home.contentBlocks[0].slug).toBe("home-boas-vindas");
    expect(home.banners[0].slug).toBe("banner-capa");
    expect(home.church.name).toBeTruthy();
    expect(prisma.ministry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          publishStatus: "PUBLISHED",
          visibility: "PUBLIC",
        }),
      }),
    );
  });

  it("getContentBySlug only returns PUBLICADO", async () => {
    const prisma = {
      cmsContent: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(cmsBlock)
          .mockResolvedValueOnce(null),
      },
    };
    const service = new PublicPortalService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(service.getContentBySlug("home-boas-vindas")).resolves.toMatchObject(
      { slug: "home-boas-vindas" },
    );
    await expect(service.getContentBySlug("rascunho")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("getMinistryBySlug 404 when not public", async () => {
    const prisma = {
      ministry: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new PublicPortalService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(service.getMinistryBySlug("louvor-demo")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("getMinistryBySlug includes related published events and CMS", async () => {
    const prisma = {
      ministry: { findFirst: jest.fn().mockResolvedValue(ministry) },
      portalEvent: { findMany: jest.fn().mockResolvedValue([event]) },
      cmsContent: {
        findMany: jest.fn().mockResolvedValue([
          { ...cmsBlock, kind: "MINISTRY_CONTENT", slug: "jovens-trilhas" },
        ]),
      },
    };
    const service = new PublicPortalService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const detail = await service.getMinistryBySlug("jovens");
    expect(detail.slug).toBe("jovens");
    expect(detail.leadership).toHaveLength(1);
    expect(detail.relatedEvents).toHaveLength(1);
    expect(detail.relatedContent[0].slug).toBe("jovens-trilhas");
  });

  it("lists and gets published events", async () => {
    const prisma = {
      portalEvent: {
        findMany: jest.fn().mockResolvedValue([event]),
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(event)
          .mockResolvedValueOnce(null),
      },
    };
    const service = new PublicPortalService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const list = await service.listEvents();
    expect(list.events).toHaveLength(1);
    await expect(
      service.getEventBySlug("encontro-jovens-demo"),
    ).resolves.toMatchObject({ slug: "encontro-jovens-demo" });
    await expect(service.getEventBySlug("missing")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("lists public ministries", async () => {
    const prisma = {
      ministry: { findMany: jest.fn().mockResolvedValue([ministry]) },
    };
    const service = new PublicPortalService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const list = await service.listMinistries();
    expect(list.ministries[0].slug).toBe("jovens");
  });
});
