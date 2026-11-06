import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { CmsService } from "./cms.service";
import type { AuthUser } from "../auth/types/auth-user";

describe("CmsService", () => {
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
    email: "lider@example.test",
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
  const draft = {
    id: "c1",
    organizationId: pilot.organizationId,
    churchId: pilot.churchId,
    ministryId: null as string | null,
    kind: "PAGE",
    slug: "sobre-nos",
    title: "Sobre",
    summary: null as string | null,
    body: "x",
    imageUrl: null as string | null,
    sortOrder: 0,
    status: "RASCUNHO",
    publishedAt: null as Date | null,
    createdByUserId: "u-sec",
    updatedByUserId: "u-sec",
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

  it("creates content in RASCUNHO and records revision", async () => {
    const tx = {
      cmsContent: { create: jest.fn().mockResolvedValue(draft) },
      cmsContentRevision: { create: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const service = new CmsService(
      { ...withTx(tx) } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
      {
        enqueueCmsPublishNotify: jest
          .fn()
          .mockResolvedValue({ notified: 0, outbox: [] }),
      } as never,
    );
    const result = await service.create(secretaria, {
      kind: "PAGE",
      slug: "Sobre-Nos",
      title: " Sobre ",
    });
    expect(result.status).toBe("RASCUNHO");
    expect(result.slug).toBe("sobre-nos");
    expect(tx.cmsContentRevision.create).toHaveBeenCalled();
  });

  it("enforces workflow transitions", async () => {
    const published = {
      ...draft,
      status: "PUBLICADO",
      publishedAt: now,
    };
    const tx = {
      cmsContent: { update: jest.fn().mockResolvedValue(published) },
      cmsContentRevision: { create: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      cmsContent: {
        findFirst: jest.fn().mockResolvedValue({
          ...draft,
          status: "APROVADO",
        }),
      },
      ...withTx(tx),
    };
    const service = new CmsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
      {
        enqueueCmsPublishNotify: jest
          .fn()
          .mockResolvedValue({ notified: 0, outbox: [] }),
      } as never,
    );
    await expect(
      service.patch(secretaria, "c1", { status: "PUBLICADO" }),
    ).resolves.toMatchObject({ status: "PUBLICADO" });

    prisma.cmsContent.findFirst.mockResolvedValueOnce({
      ...draft,
      status: "RASCUNHO",
    });
    await expect(
      service.patch(secretaria, "c1", { status: "PUBLICADO" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("LIDER cannot create church-wide HOME_BLOCK", async () => {
    const service = new CmsService(
      { $transaction: jest.fn() } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
      {
        enqueueCmsPublishNotify: jest
          .fn()
          .mockResolvedValue({ notified: 0, outbox: [] }),
      } as never,
    );
    await expect(
      service.create(lider, {
        kind: "HOME_BLOCK",
        slug: "home-x",
        title: "X",
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("LIDER can create MINISTRY_CONTENT for own ministry", async () => {
    const row = { ...draft, kind: "MINISTRY_CONTENT", ministryId: "m-jovens" };
    const tx = {
      cmsContent: { create: jest.fn().mockResolvedValue(row) },
      cmsContentRevision: { create: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      ministry: { findFirst: jest.fn().mockResolvedValue({ id: "m-jovens" }) },
      ...withTx(tx),
    };
    const service = new CmsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
      {
        enqueueCmsPublishNotify: jest
          .fn()
          .mockResolvedValue({ notified: 0, outbox: [] }),
      } as never,
    );
    await expect(
      service.create(lider, {
        kind: "MINISTRY_CONTENT",
        slug: "jovens-x",
        title: "X",
        ministryId: "m-jovens",
      }),
    ).resolves.toMatchObject({ ministryId: "m-jovens" });
  });

  it("404 on missing content", async () => {
    const service = new CmsService(
      {
        cmsContent: { findFirst: jest.fn().mockResolvedValue(null) },
      } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
      {
        enqueueCmsPublishNotify: jest
          .fn()
          .mockResolvedValue({ notified: 0, outbox: [] }),
      } as never,
    );
    await expect(service.get(secretaria, "missing")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("lists filtering for lider and rejects membro", async () => {
    const rows = [
      { ...draft, id: "c1", ministryId: "m-jovens" },
      { ...draft, id: "c2", ministryId: null, slug: "home" },
      { ...draft, id: "c3", ministryId: "m-homens", slug: "h" },
    ];
    const prisma = {
      cmsContent: { findMany: jest.fn().mockResolvedValue(rows) },
    };
    const service = new CmsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
      {
        enqueueCmsPublishNotify: jest
          .fn()
          .mockResolvedValue({ notified: 0, outbox: [] }),
      } as never,
    );
    const list = await service.list(lider, "MINISTRY_CONTENT");
    expect(list.contents.map((c) => c.id)).toEqual(["c1"]);

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
    await expect(service.list(membro)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("get returns revisions; patch fields + advance + archive path", async () => {
    const tx = {
      cmsContent: {
        update: jest.fn().mockResolvedValue({
          ...draft,
          title: "Novo",
          status: "REVISAO",
          summary: "s",
          body: "b",
          imageUrl: "/i.jpg",
          sortOrder: 2,
        }),
      },
      cmsContentRevision: { create: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      cmsContent: {
        findFirst: jest.fn().mockResolvedValue(draft),
      },
      cmsContentRevision: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "r1",
            fromStatus: "RASCUNHO",
            toStatus: "RASCUNHO",
            actorUserId: "u-sec",
            note: "create",
            snapshot: {},
            createdAt: now,
          },
        ]),
      },
      ...withTx(tx),
    };
    const service = new CmsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
      {
        enqueueCmsPublishNotify: jest
          .fn()
          .mockResolvedValue({ notified: 0, outbox: [] }),
      } as never,
    );
    const detail = await service.get(secretaria, "c1");
    expect(detail.revisions).toHaveLength(1);

    await expect(
      service.patch(secretaria, "c1", {
        title: " Novo ",
        summary: "s",
        body: "b",
        imageUrl: "/i.jpg",
        sortOrder: 2,
        status: "REVISAO",
        note: "enviar",
      }),
    ).resolves.toMatchObject({ status: "REVISAO", title: "Novo" });

    await expect(
      service.advance(secretaria, "c1", "REVISAO"),
    ).resolves.toBeTruthy();

    await expect(
      service.create(secretaria, {
        kind: "MINISTRY_CONTENT",
        slug: "x",
        title: "x",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.create(secretaria, {
        kind: "PAGE" as never,
        slug: " ",
        title: "t",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects invalid kind and slug change by lider", async () => {
    const prisma = {
      cmsContent: {
        findFirst: jest.fn().mockResolvedValue({
          ...draft,
          ministryId: "m-jovens",
        }),
      },
      $transaction: jest.fn(),
    };
    const service = new CmsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
      {
        enqueueCmsPublishNotify: jest
          .fn()
          .mockResolvedValue({ notified: 0, outbox: [] }),
      } as never,
    );
    await expect(
      service.patch(lider, "c1", { slug: "hack" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.create(secretaria, {
        kind: "NOPE" as never,
        slug: "x",
        title: "t",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("patch validates slug/kind/ministry/status and unpublishes to RASCUNHO", async () => {
    const archived = {
      ...draft,
      status: "ARQUIVADO",
      publishedAt: now,
    };
    const tx = {
      cmsContent: {
        update: jest.fn().mockResolvedValue({
          ...archived,
          status: "RASCUNHO",
          publishedAt: null,
          slug: "sobre-2",
          kind: "NEWS",
          ministryId: "m-jovens",
        }),
      },
      cmsContentRevision: { create: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      cmsContent: { findFirst: jest.fn().mockResolvedValue(archived) },
      ministry: { findFirst: jest.fn().mockResolvedValue({ id: "m-jovens" }) },
      ...withTx(tx),
    };
    const service = new CmsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
      {
        enqueueCmsPublishNotify: jest
          .fn()
          .mockResolvedValue({ notified: 0, outbox: [] }),
      } as never,
    );

    await expect(
      service.patch(secretaria, "c1", { slug: " " }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.patch(secretaria, "c1", { kind: "NOPE" as never }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.patch(secretaria, "c1", { status: "NOPE" as never }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.patch(secretaria, "c1", {
        slug: " Sobre-2 ",
        kind: "NEWS",
        ministryId: "m-jovens",
        status: "RASCUNHO",
        note: "voltar",
      }),
    ).resolves.toMatchObject({ status: "RASCUNHO", slug: "sobre-2" });
  });
});
