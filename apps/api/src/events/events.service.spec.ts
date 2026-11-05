import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { EventsService } from "./events.service";
import type { AuthUser } from "../auth/types/auth-user";

describe("EventsService", () => {
  const pilot = {
    organizationId: "org1",
    churchId: "church-rf1",
    organizationSlug: "igreja-de-deus",
    churchSlug: "riacho-fundo-1",
    churchName: "Riacho Fundo I (demo)",
  };

  const secretaria: AuthUser = {
    userId: "u-sec",
    personId: "p-sec",
    email: "ana.demo@example.test",
    grants: [
      {
        roleCode: "SECRETARIA",
        organizationId: "org1",
        churchId: "church-rf1",
      },
    ],
  };

  const lider: AuthUser = {
    userId: "u-lider",
    personId: "p-lider",
    email: "lider.jovens.demo@example.test",
    grants: [
      {
        roleCode: "LIDER_MINISTERIO",
        organizationId: "org1",
        churchId: "church-rf1",
        ministryId: "m-jovens",
      },
    ],
  };

  const now = new Date("2026-11-05T12:00:00Z");
  const startsAt = new Date("2026-11-15T22:00:00Z");

  const eventRow = {
    id: "e1",
    organizationId: pilot.organizationId,
    churchId: pilot.churchId,
    ministryId: "m-jovens" as string | null,
    name: "Encontro",
    slug: "encontro",
    description: "demo",
    imageUrl: null as string | null,
    startsAt,
    endsAt: null as Date | null,
    locationText: "Salão",
    status: "DRAFT",
    featuredOnHome: false,
    publishedAt: null as Date | null,
    cancelledAt: null as Date | null,
    createdAt: now,
    updatedAt: now,
  };

  function withTx(tx: object) {
    return {
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    };
  }

  it("secretaria creates and publishes event", async () => {
    const published = {
      ...eventRow,
      status: "PUBLISHED",
      publishedAt: now,
      featuredOnHome: true,
    };
    const tx = {
      portalEvent: {
        create: jest.fn().mockResolvedValue(eventRow),
        update: jest.fn().mockResolvedValue(published),
      },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      ministry: {
        findFirst: jest.fn().mockResolvedValue({ id: "m-jovens" }),
      },
      portalEvent: { findFirst: jest.fn().mockResolvedValue(eventRow) },
      ...withTx(tx),
    };
    const service = new EventsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    const created = await service.create(secretaria, {
      name: " Encontro ",
      slug: "Encontro",
      startsAt: startsAt.toISOString(),
      ministryId: "m-jovens",
    });
    expect(created.slug).toBe("encontro");

    const pub = await service.publish(secretaria, "e1");
    expect(pub.status).toBe("PUBLISHED");
  });

  it("LIDER cannot create church-wide event without ministryId", async () => {
    const service = new EventsService(
      { $transaction: jest.fn() } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      service.create(lider, {
        name: "X",
        slug: "x",
        startsAt: startsAt.toISOString(),
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("LIDER can create for own ministry only", async () => {
    const tx = {
      portalEvent: { create: jest.fn().mockResolvedValue(eventRow) },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      ministry: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ id: "m-jovens" })
          .mockResolvedValueOnce({ id: "m-homens" }),
      },
      ...withTx(tx),
    };
    const service = new EventsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    await expect(
      service.create(lider, {
        name: "Jovens",
        slug: "jovens-evt",
        startsAt: startsAt.toISOString(),
        ministryId: "m-jovens",
      }),
    ).resolves.toMatchObject({ id: "e1" });

    await expect(
      service.create(lider, {
        name: "Homens",
        slug: "homens-evt",
        startsAt: startsAt.toISOString(),
        ministryId: "m-homens",
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects invalid startsAt and missing event", async () => {
    const prisma = {
      ministry: { findFirst: jest.fn().mockResolvedValue({ id: "m-jovens" }) },
      portalEvent: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(),
    };
    const service = new EventsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      service.create(secretaria, {
        name: "X",
        slug: "x",
        startsAt: "bad",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create(secretaria, {
        name: "X",
        slug: "x",
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.get(secretaria, "missing")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("cancels and archives", async () => {
    const tx = {
      portalEvent: {
        update: jest
          .fn()
          .mockResolvedValueOnce({
            ...eventRow,
            status: "CANCELLED",
            cancelledAt: now,
          })
          .mockResolvedValueOnce({
            ...eventRow,
            status: "ARCHIVED",
            featuredOnHome: false,
          }),
      },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      portalEvent: {
        findFirst: jest.fn().mockResolvedValue({
          ...eventRow,
          status: "PUBLISHED",
        }),
      },
      ...withTx(tx),
    };
    const service = new EventsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(service.cancel(secretaria, "e1")).resolves.toMatchObject({
      status: "CANCELLED",
    });
    await expect(service.archive(secretaria, "e1")).resolves.toMatchObject({
      status: "ARCHIVED",
    });
  });

  it("lists for lider and patches fields including draft reset", async () => {
    const rows = [
      eventRow,
      { ...eventRow, id: "e2", ministryId: "m-homens", slug: "h" },
      { ...eventRow, id: "e3", ministryId: null, slug: "g" },
    ];
    const listPrisma = {
      portalEvent: { findMany: jest.fn().mockResolvedValue(rows) },
    };
    const listService = new EventsService(
      listPrisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const listed = await listService.list(lider);
    expect(listed.events.map((e) => e.id)).toEqual(["e1"]);

    const membro: AuthUser = {
      userId: "u-m",
      personId: "p-m",
      email: "m@test",
      grants: [
        {
          roleCode: "MEMBRO",
          organizationId: "org1",
          churchId: "church-rf1",
        },
      ],
    };
    await expect(listService.list(membro)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    const draftRow = {
      ...eventRow,
      status: "PUBLISHED",
      publishedAt: now,
      featuredOnHome: true,
    };
    const tx = {
      portalEvent: {
        update: jest.fn().mockResolvedValue({
          ...draftRow,
          status: "DRAFT",
          publishedAt: null,
          cancelledAt: null,
          name: "Novo",
          slug: "novo",
          description: "d",
          imageUrl: "/x",
          locationText: "L",
          featuredOnHome: false,
          endsAt: startsAt,
        }),
      },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      ministry: { findFirst: jest.fn().mockResolvedValue({ id: "m-jovens" }) },
      portalEvent: { findFirst: jest.fn().mockResolvedValue(draftRow) },
      ...withTx(tx),
    };
    const service = new EventsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(service.get(secretaria, "e1")).resolves.toMatchObject({
      id: "e1",
    });
    await expect(
      service.patch(secretaria, "e1", {
        name: " Novo ",
        slug: "Novo",
        description: "d",
        imageUrl: "/x",
        locationText: "L",
        featuredOnHome: false,
        startsAt: startsAt.toISOString(),
        endsAt: startsAt.toISOString(),
        ministryId: "m-jovens",
        status: "DRAFT",
      }),
    ).resolves.toMatchObject({ status: "DRAFT", slug: "novo" });

    await expect(
      service.create(secretaria, {
        name: " ",
        slug: "x",
        startsAt: startsAt.toISOString(),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.patch(secretaria, "e1", { name: " " }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.patch(secretaria, "e1", { slug: " " }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.patch(secretaria, "e1", { status: "NOPE" as never }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
