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

  it("home returns published ministries and featured events only", async () => {
    const prisma = {
      ministry: { findMany: jest.fn().mockResolvedValue([ministry]) },
      portalEvent: { findMany: jest.fn().mockResolvedValue([event]) },
    };
    const service = new PublicPortalService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const home = await service.home();
    expect(home.ministries).toHaveLength(1);
    expect(home.featuredEvents[0].slug).toBe("encontro-jovens-demo");
    expect(home.contentBlocks).toEqual([]);
    expect(prisma.ministry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          publishStatus: "PUBLISHED",
          visibility: "PUBLIC",
        }),
      }),
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

  it("getMinistryBySlug includes related published events", async () => {
    const prisma = {
      ministry: { findFirst: jest.fn().mockResolvedValue(ministry) },
      portalEvent: { findMany: jest.fn().mockResolvedValue([event]) },
    };
    const service = new PublicPortalService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const detail = await service.getMinistryBySlug("jovens");
    expect(detail.slug).toBe("jovens");
    expect(detail.leadership).toHaveLength(1);
    expect(detail.relatedEvents).toHaveLength(1);
    expect(detail.relatedContent).toEqual([]);
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
});
