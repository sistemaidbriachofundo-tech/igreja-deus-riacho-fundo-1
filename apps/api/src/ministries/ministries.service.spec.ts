import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { MinistriesService } from "./ministries.service";
import type { AuthUser } from "../auth/types/auth-user";

describe("MinistriesService", () => {
  const pilot = {
    organizationId: "org1",
    churchId: "church-rf1",
    organizationSlug: "igreja-de-deus",
    churchSlug: "riacho-fundo-1",
    churchName: "Riacho Fundo I (demo)",
  };

  const lider: AuthUser = {
    userId: "u-lider",
    personId: "p-lider",
    email: "lider.demo@example.test",
    grants: [
      {
        roleCode: "LIDER_MINISTERIO",
        organizationId: "org1",
        churchId: "church-rf1",
        ministryId: "m1",
      },
    ],
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

  const membro: AuthUser = {
    userId: "u-mem",
    personId: "p-mem",
    email: "bruno.demo@example.test",
    grants: [
      {
        roleCode: "MEMBRO",
        organizationId: "org1",
        churchId: "church-rf1",
      },
    ],
  };

  const outsider: AuthUser = {
    userId: "u-out",
    personId: "p-out",
    email: "out@example.test",
    grants: [
      {
        roleCode: "MEMBRO",
        organizationId: "org1",
        churchId: "other-church",
      },
    ],
  };

  const now = new Date("2026-11-05T12:00:00Z");
  const serviceAt = new Date("2026-11-09T19:00:00Z");

  const ministryRow = {
    id: "m1",
    organizationId: pilot.organizationId,
    churchId: pilot.churchId,
    name: "Louvor",
    slug: "louvor",
    leaderPersonId: "p-lider" as string | null,
    description: null as string | null,
    coverImageUrl: null as string | null,
    galleryUrls: [] as string[],
    scheduleText: null as string | null,
    leadershipPublic: null as unknown,
    participationInfo: null as string | null,
    visibility: "INTERNAL",
    publishStatus: "DRAFT",
    publishedAt: null as Date | null,
    createdAt: now,
    updatedAt: now,
  };

  const rosterRow = {
    id: "r1",
    organizationId: pilot.organizationId,
    churchId: pilot.churchId,
    ministryId: "m1" as string | null,
    title: "Culto Domingo",
    serviceAt,
    status: "DRAFT",
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

  it("forbids MEMBRO from creating ministries", async () => {
    const service = new MinistriesService(
      { $transaction: jest.fn() } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      service.createMinistry(membro, { name: "Louvor", slug: "louvor" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("forbids LIDER from creating ministries (admin only)", async () => {
    const service = new MinistriesService(
      { $transaction: jest.fn() } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      service.createMinistry(lider, { name: "Louvor", slug: "louvor" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("creates ministry for secretaria and audits", async () => {
    const tx = {
      ministry: {
        create: jest.fn().mockResolvedValue(ministryRow),
      },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      person: { findFirst: jest.fn().mockResolvedValue({ id: "p-lider" }) },
      ...withTx(tx),
    };
    const service = new MinistriesService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    const result = await service.createMinistry(secretaria, {
      name: " Louvor ",
      slug: "Louvor",
      leaderPersonId: "p-lider",
    });
    expect(result.id).toBe("m1");
    expect(result.slug).toBe("louvor");
    expect(tx.auditLog.create).toHaveBeenCalled();
  });

  it("rejects createMinistry without name/slug or missing leader", async () => {
    const prisma = {
      person: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(),
    };
    const service = new MinistriesService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      service.createMinistry(secretaria, { name: " ", slug: "x" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createMinistry(secretaria, {
        name: "X",
        slug: "x",
        leaderPersonId: "missing",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("LIDER patches own ministry but not another", async () => {
    const other = { ...ministryRow, id: "m2", slug: "homens", leaderPersonId: "p-other" };
    const tx = {
      ministry: {
        update: jest
          .fn()
          .mockResolvedValue({ ...ministryRow, description: "ok", publishStatus: "PUBLISHED", visibility: "PUBLIC", publishedAt: now }),
      },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      ministry: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(ministryRow)
          .mockResolvedValueOnce(other),
      },
      ...withTx(tx),
    };
    const service = new MinistriesService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const patched = await service.patchMinistry(lider, "m1", {
      description: "ok",
    });
    expect(patched.description).toBe("ok");
    await expect(
      service.patchMinistry(lider, "m2", { description: "nope" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("get/publish/archive and list filters for lider", async () => {
    const other = {
      ...ministryRow,
      id: "m2",
      slug: "homens",
      leaderPersonId: "p-other",
    };
    const published = {
      ...ministryRow,
      publishStatus: "PUBLISHED",
      visibility: "PUBLIC",
      publishedAt: now,
      description: "d",
      coverImageUrl: "/c.jpg",
      galleryUrls: ["/g.jpg"],
      scheduleText: "sáb",
      leadershipPublic: [{ displayName: "L", roleTitle: "C" }],
      participationInfo: "venha",
    };
    const tx = {
      ministry: {
        update: jest
          .fn()
          .mockResolvedValueOnce(published)
          .mockResolvedValueOnce({
            ...published,
            publishStatus: "ARCHIVED",
          })
          .mockResolvedValueOnce({
            ...published,
            name: "Louvor 2",
            publishStatus: "DRAFT",
            publishedAt: null,
          })
          .mockResolvedValueOnce({
            ...ministryRow,
            slug: "louvor-2",
            leaderPersonId: "p-lider",
          }),
      },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      ministry: {
        findFirst: jest.fn().mockResolvedValue(ministryRow),
        findMany: jest.fn().mockResolvedValue([ministryRow, other]),
      },
      person: { findFirst: jest.fn().mockResolvedValue({ id: "p-lider" }) },
      ...withTx(tx),
    };
    const service = new MinistriesService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(service.getMinistry(lider, "m1")).resolves.toMatchObject({
      id: "m1",
    });
    const listed = await service.listMinistries(lider);
    expect(listed.ministries.map((m) => m.id)).toEqual(["m1"]);
    await expect(service.publishMinistry(lider, "m1")).resolves.toMatchObject({
      publishStatus: "PUBLISHED",
    });
    await expect(service.archiveMinistry(lider, "m1")).resolves.toMatchObject({
      publishStatus: "ARCHIVED",
    });

    await expect(
      service.patchMinistry(lider, "m1", {
        name: " Louvor 2 ",
        description: "d",
        coverImageUrl: "/c.jpg",
        galleryUrls: ["/g.jpg", " "],
        scheduleText: "sáb",
        leadershipPublic: [{ displayName: "L", roleTitle: "C" }],
        participationInfo: "venha",
        visibility: "PUBLIC",
        publishStatus: "DRAFT",
      }),
    ).resolves.toMatchObject({ name: "Louvor 2" });

    await expect(
      service.patchMinistry(lider, "m1", { slug: "hack" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.patchMinistry(lider, "m1", { leaderPersonId: "p-x" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.patchMinistry(secretaria, "m1", { name: " " }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.patchMinistry(secretaria, "m1", { visibility: "NOPE" as never }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.patchMinistry(secretaria, "m1", {
        publishStatus: "NOPE" as never,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.patchMinistry(secretaria, "m1", { slug: " " }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.patchMinistry(secretaria, "m1", {
        slug: " Louvor-2 ",
        leaderPersonId: "p-lider",
      }),
    ).resolves.toMatchObject({ slug: "louvor-2" });
  });

  it("lists ministries", async () => {
    const prisma = {
      ministry: { findMany: jest.fn().mockResolvedValue([ministryRow]) },
    };
    const service = new MinistriesService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const result = await service.listMinistries(lider);
    expect(result.ministries).toHaveLength(1);
    expect(result.churchId).toBe(pilot.churchId);
  });

  it("creates roster with ministry and validates inputs", async () => {
    const tx = {
      roster: { create: jest.fn().mockResolvedValue(rosterRow) },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      ministry: { findFirst: jest.fn().mockResolvedValue(ministryRow) },
      ...withTx(tx),
    };
    const service = new MinistriesService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    await expect(
      service.createRoster(lider, { title: " ", serviceAt: serviceAt.toISOString() }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.createRoster(lider, { title: "Culto", serviceAt: "bad" }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.ministry.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.createRoster(lider, {
        title: "Culto",
        serviceAt: serviceAt.toISOString(),
        ministryId: "missing",
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    const result = await service.createRoster(lider, {
      title: " Culto Domingo ",
      serviceAt: serviceAt.toISOString(),
      ministryId: "m1",
    });
    expect(result.id).toBe("r1");
    expect(result.serviceAt).toBe(serviceAt.toISOString());
  });

  it("creates roster without ministryId", async () => {
    const tx = {
      roster: {
        create: jest.fn().mockResolvedValue({ ...rosterRow, ministryId: null }),
      },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      ministry: { findFirst: jest.fn() },
      ...withTx(tx),
    };
    const service = new MinistriesService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const result = await service.createRoster(lider, {
      title: "Especial",
      serviceAt: serviceAt.toISOString(),
    });
    expect(result.ministryId).toBeNull();
    expect(prisma.ministry.findFirst).not.toHaveBeenCalled();
  });

  it("lists rosters with slots and assignments", async () => {
    const prisma = {
      roster: {
        findMany: jest.fn().mockResolvedValue([
          {
            ...rosterRow,
            slots: [
              {
                id: "slot1",
                rosterId: "r1",
                roleLabel: "Voz",
                requiresCouple: false,
                sortOrder: 0,
                assignments: [
                  {
                    id: "a1",
                    slotId: "slot1",
                    personId: "p-mem",
                    partnerPersonId: null,
                    status: "PENDING",
                    substituteForId: null,
                    confirmedAt: null,
                    declinedAt: null,
                    createdAt: now,
                    updatedAt: now,
                  },
                ],
              },
            ],
          },
        ]),
      },
    };
    const service = new MinistriesService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const result = await service.listRosters(lider);
    expect(result.rosters[0].slots[0].assignments[0].id).toBe("a1");
  });

  it("adds slot and 404s missing roster / empty roleLabel", async () => {
    const tx = {
      rosterSlot: {
        create: jest.fn().mockResolvedValue({
          id: "slot1",
          rosterId: "r1",
          roleLabel: "Casal",
          requiresCouple: true,
          sortOrder: 2,
        }),
      },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      roster: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(rosterRow)
          .mockResolvedValueOnce(rosterRow),
      },
      ...withTx(tx),
    };
    const service = new MinistriesService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    await expect(
      service.addSlot(lider, "missing", { roleLabel: "Voz" }),
    ).rejects.toBeInstanceOf(NotFoundException);

    await expect(
      service.addSlot(lider, "r1", { roleLabel: "  " }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const result = await service.addSlot(lider, "r1", {
      roleLabel: " Casal ",
      requiresCouple: true,
      sortOrder: 2,
    });
    expect(result.requiresCouple).toBe(true);
    expect(result.sortOrder).toBe(2);
  });

  it("adds assignment with partner when requiresCouple", async () => {
    const assignment = {
      id: "a1",
      slotId: "slot1",
      personId: "p-mem",
      partnerPersonId: "p-partner",
      status: "PENDING",
      substituteForId: null,
      confirmedAt: null,
      declinedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const tx = {
      rosterAssignment: { create: jest.fn().mockResolvedValue(assignment) },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      rosterSlot: {
        findFirst: jest.fn().mockResolvedValue({
          id: "slot1",
          rosterId: "r1",
          roleLabel: "Casal",
          requiresCouple: true,
          sortOrder: 0,
          roster: {
            id: "r1",
            organizationId: pilot.organizationId,
            churchId: pilot.churchId,
            serviceAt,
          },
        }),
      },
      person: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ id: "p-mem" })
          .mockResolvedValueOnce({ id: "p-partner" }),
      },
      rosterAssignment: { findMany: jest.fn().mockResolvedValue([]) },
      ...withTx(tx),
    };
    const service = new MinistriesService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    const result = await service.addAssignment(lider, "slot1", {
      personId: "p-mem",
      partnerPersonId: "p-partner",
    });
    expect(result.partnerPersonId).toBe("p-partner");
  });

  it("rejects assignment without partner when requiresCouple", async () => {
    const prisma = {
      rosterSlot: {
        findFirst: jest.fn().mockResolvedValue({
          id: "slot1",
          rosterId: "r1",
          roleLabel: "Casal",
          requiresCouple: true,
          sortOrder: 0,
          roster: {
            id: "r1",
            organizationId: pilot.organizationId,
            churchId: pilot.churchId,
            serviceAt,
          },
        }),
      },
      person: {
        findFirst: jest.fn().mockResolvedValue({ id: "p-mem" }),
      },
      rosterAssignment: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(),
    };
    const service = new MinistriesService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    await expect(
      service.addAssignment(lider, "slot1", { personId: "p-mem" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects conflicting PENDING/CONFIRMED assignment at same serviceAt", async () => {
    const prisma = {
      rosterSlot: {
        findFirst: jest.fn().mockResolvedValue({
          id: "slot1",
          rosterId: "r1",
          roleLabel: "Voz",
          requiresCouple: false,
          sortOrder: 0,
          roster: {
            id: "r1",
            organizationId: pilot.organizationId,
            churchId: pilot.churchId,
            serviceAt,
          },
        }),
      },
      person: {
        findFirst: jest.fn().mockResolvedValue({ id: "p-mem" }),
      },
      rosterAssignment: {
        findMany: jest.fn().mockResolvedValue([{ id: "a-other", personId: "p-mem" }]),
      },
      $transaction: jest.fn(),
    };
    const service = new MinistriesService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    await expect(
      service.addAssignment(lider, "slot1", { personId: "p-mem" }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("rejects addAssignment for missing slot / empty personId / missing person", async () => {
    const prisma = {
      rosterSlot: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValue({
            id: "slot1",
            rosterId: "r1",
            roleLabel: "Voz",
            requiresCouple: false,
            sortOrder: 0,
            roster: {
              id: "r1",
              organizationId: pilot.organizationId,
              churchId: pilot.churchId,
              serviceAt,
            },
          }),
      },
      person: { findFirst: jest.fn().mockResolvedValue(null) },
      rosterAssignment: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(),
    };
    const service = new MinistriesService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    await expect(
      service.addAssignment(lider, "missing", { personId: "p-mem" }),
    ).rejects.toBeInstanceOf(NotFoundException);

    await expect(
      service.addAssignment(lider, "slot1", { personId: "  " }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.addAssignment(lider, "slot1", { personId: "p-missing" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("allows MEMBRO to confirm own assignment", async () => {
    const assignment = {
      id: "a1",
      slotId: "slot1",
      personId: "p-mem",
      partnerPersonId: null,
      status: "PENDING",
      substituteForId: null,
      confirmedAt: null,
      declinedAt: null,
      createdAt: now,
      updatedAt: now,
      slot: {
        id: "slot1",
        requiresCouple: false,
        roster: {
          id: "r1",
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          serviceAt,
        },
      },
    };
    const tx = {
      rosterAssignment: {
        update: jest.fn().mockResolvedValue({
          ...assignment,
          status: "CONFIRMED",
          confirmedAt: now,
        }),
      },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      rosterAssignment: {
        findFirst: jest.fn().mockResolvedValue(assignment),
        findMany: jest.fn().mockResolvedValue([]),
      },
      ...withTx(tx),
    };
    const service = new MinistriesService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    const result = await service.confirmAssignment(membro, "a1");
    expect(result.status).toBe("CONFIRMED");
    expect(tx.auditLog.create).toHaveBeenCalled();
  });

  it("forbids outsider confirming assignment and 404s missing", async () => {
    const assignment = {
      id: "a1",
      slotId: "slot1",
      personId: "p-mem",
      partnerPersonId: null,
      status: "PENDING",
      substituteForId: null,
      confirmedAt: null,
      declinedAt: null,
      createdAt: now,
      updatedAt: now,
      slot: {
        id: "slot1",
        requiresCouple: false,
        roster: {
          id: "r1",
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          serviceAt,
        },
      },
    };
    const prisma = {
      rosterAssignment: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(assignment),
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn(),
    };
    const service = new MinistriesService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    await expect(
      service.confirmAssignment(membro, "missing"),
    ).rejects.toBeInstanceOf(NotFoundException);

    await expect(
      service.confirmAssignment(outsider, "a1"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("allows MEMBRO to decline own assignment", async () => {
    const assignment = {
      id: "a1",
      slotId: "slot1",
      personId: "p-mem",
      partnerPersonId: null,
      status: "PENDING",
      substituteForId: null,
      confirmedAt: null,
      declinedAt: null,
      createdAt: now,
      updatedAt: now,
      slot: {
        id: "slot1",
        requiresCouple: false,
        roster: {
          id: "r1",
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          serviceAt,
        },
      },
    };
    const tx = {
      rosterAssignment: {
        update: jest.fn().mockResolvedValue({
          ...assignment,
          status: "DECLINED",
          declinedAt: now,
        }),
      },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      rosterAssignment: {
        findFirst: jest.fn().mockResolvedValue(assignment),
      },
      ...withTx(tx),
    };
    const service = new MinistriesService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const result = await service.declineAssignment(membro, "a1");
    expect(result.status).toBe("DECLINED");
  });

  it("substitutes assignment and validates couple / person / conflict", async () => {
    const assignment = {
      id: "a1",
      slotId: "slot1",
      personId: "p-mem",
      partnerPersonId: "p-partner",
      status: "PENDING",
      substituteForId: null,
      confirmedAt: null,
      declinedAt: null,
      createdAt: now,
      updatedAt: now,
      slot: {
        id: "slot1",
        requiresCouple: true,
        roster: {
          id: "r1",
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          serviceAt,
        },
      },
    };
    const substitute = {
      id: "a2",
      slotId: "slot1",
      personId: "p-new",
      partnerPersonId: "p-new-partner",
      status: "PENDING",
      substituteForId: "a1",
      confirmedAt: null,
      declinedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const tx = {
      rosterAssignment: {
        update: jest.fn().mockResolvedValue({ ...assignment, status: "SUBSTITUTED" }),
        create: jest.fn().mockResolvedValue(substitute),
      },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      rosterAssignment: {
        findFirst: jest.fn().mockResolvedValue(assignment),
        findMany: jest.fn().mockResolvedValue([]),
      },
      person: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ id: "p-new" }) // couple without partner
          .mockResolvedValueOnce({ id: "p-new" }) // happy path person
          .mockResolvedValueOnce({ id: "p-new-partner" }),
      },
      ...withTx(tx),
    };
    const service = new MinistriesService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    await expect(
      service.substituteAssignment(lider, "a1", { personId: "  " }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.substituteAssignment(lider, "a1", { personId: "p-new" }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const result = await service.substituteAssignment(lider, "a1", {
      personId: "p-new",
      partnerPersonId: "p-new-partner",
    });
    expect(result.substituteForId).toBe("a1");
    expect(tx.auditLog.create).toHaveBeenCalled();
  });

  it("forbids MEMBRO from substituting and rejects conflict on substitute", async () => {
    const assignment = {
      id: "a1",
      slotId: "slot1",
      personId: "p-mem",
      partnerPersonId: null,
      status: "PENDING",
      substituteForId: null,
      confirmedAt: null,
      declinedAt: null,
      createdAt: now,
      updatedAt: now,
      slot: {
        id: "slot1",
        requiresCouple: false,
        roster: {
          id: "r1",
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          serviceAt,
        },
      },
    };
    const prisma = {
      rosterAssignment: {
        findFirst: jest.fn().mockResolvedValue(assignment),
        findMany: jest.fn().mockResolvedValue([{ id: "a-other", personId: "p-new" }]),
      },
      person: { findFirst: jest.fn().mockResolvedValue({ id: "p-new" }) },
      $transaction: jest.fn(),
    };
    const service = new MinistriesService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    await expect(
      service.substituteAssignment(membro, "a1", { personId: "p-new" }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      service.substituteAssignment(lider, "a1", { personId: "p-new" }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("allows líder to confirm any assignment", async () => {
    const assignment = {
      id: "a1",
      slotId: "slot1",
      personId: "p-mem",
      partnerPersonId: null,
      status: "PENDING",
      substituteForId: null,
      confirmedAt: null,
      declinedAt: null,
      createdAt: now,
      updatedAt: now,
      slot: {
        id: "slot1",
        requiresCouple: false,
        roster: {
          id: "r1",
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          serviceAt,
        },
      },
    };
    const tx = {
      rosterAssignment: {
        update: jest.fn().mockResolvedValue({
          ...assignment,
          status: "CONFIRMED",
          confirmedAt: now,
        }),
      },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      rosterAssignment: {
        findFirst: jest.fn().mockResolvedValue(assignment),
        findMany: jest.fn().mockResolvedValue([]),
      },
      ...withTx(tx),
    };
    const service = new MinistriesService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const result = await service.confirmAssignment(lider, "a1");
    expect(result.status).toBe("CONFIRMED");
  });

  it("publishes DRAFT roster and closes PUBLISHED with audit", async () => {
    const published = { ...rosterRow, status: "PUBLISHED" };
    const closed = { ...rosterRow, status: "CLOSED" };
    const withSlots = {
      ...rosterRow,
      slots: [
        {
          id: "slot1",
          assignments: [
            {
              id: "a1",
              personId: "p-mem",
              partnerPersonId: null,
              status: "PENDING",
            },
          ],
        },
      ],
    };

    const findFirst = jest
      .fn()
      .mockResolvedValueOnce(rosterRow) // publish requireRoster
      .mockResolvedValueOnce(withSlots) // publish with slots
      .mockResolvedValueOnce(published) // close requireRoster
      .mockResolvedValueOnce(published); // close again path for not-draft etc.

    const publishTx = {
      roster: { update: jest.fn().mockResolvedValue(published) },
      auditLog: { create: jest.fn() },
    };
    const closeTx = {
      roster: { update: jest.fn().mockResolvedValue(closed) },
      auditLog: { create: jest.fn() },
    };

    const prisma = {
      roster: { findFirst },
      rosterAssignment: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest
        .fn()
        .mockImplementationOnce(async (fn: (t: typeof publishTx) => unknown) =>
          fn(publishTx),
        )
        .mockImplementationOnce(async (fn: (t: typeof closeTx) => unknown) =>
          fn(closeTx),
        ),
    };
    const service = new MinistriesService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    const pub = await service.publishRoster(lider, "r1");
    expect(pub.status).toBe("PUBLISHED");
    expect(publishTx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "roster.publish" }),
      }),
    );

    const clo = await service.closeRoster(lider, "r1");
    expect(clo.status).toBe("CLOSED");
    expect(closeTx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "roster.close" }),
      }),
    );
  });

  it("rejects publish when not DRAFT, empty, or internal conflict", async () => {
    const published = { ...rosterRow, status: "PUBLISHED" };
    const emptySlots = { ...rosterRow, slots: [] };
    const dupSlots = {
      ...rosterRow,
      slots: [
        {
          id: "s1",
          assignments: [
            { id: "a1", personId: "p-mem", partnerPersonId: null, status: "PENDING" },
          ],
        },
        {
          id: "s2",
          assignments: [
            { id: "a2", personId: "p-mem", partnerPersonId: null, status: "CONFIRMED" },
          ],
        },
      ],
    };

    const findFirst = jest
      .fn()
      .mockResolvedValueOnce(published) // publish: not DRAFT
      .mockResolvedValueOnce(rosterRow) // publish: empty slots path
      .mockResolvedValueOnce(emptySlots)
      .mockResolvedValueOnce(rosterRow) // publish: internal conflict
      .mockResolvedValueOnce(dupSlots)
      .mockResolvedValueOnce(rosterRow); // close: DRAFT → not PUBLISHED

    const service = new MinistriesService(
      {
        roster: { findFirst },
        rosterAssignment: { findMany: jest.fn().mockResolvedValue([]) },
        $transaction: jest.fn(),
      } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    await expect(service.publishRoster(lider, "r1")).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(service.publishRoster(lider, "r1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.publishRoster(lider, "r1")).rejects.toBeInstanceOf(
      ConflictException,
    );

    await expect(service.closeRoster(lider, "r1")).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("blocks addSlot on PUBLISHED and mutations on CLOSED", async () => {
    const published = { ...rosterRow, status: "PUBLISHED" };
    const closed = { ...rosterRow, status: "CLOSED" };
    const service = new MinistriesService(
      {
        roster: {
          findFirst: jest
            .fn()
            .mockResolvedValueOnce(published)
            .mockResolvedValueOnce(closed),
        },
        rosterSlot: {
          findFirst: jest.fn().mockResolvedValue({
            id: "slot1",
            rosterId: "r1",
            roleLabel: "Voz",
            requiresCouple: false,
            sortOrder: 0,
            roster: closed,
          }),
        },
        $transaction: jest.fn(),
      } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    await expect(
      service.addSlot(lider, "r1", { roleLabel: "Voz" }),
    ).rejects.toBeInstanceOf(ConflictException);

    await expect(
      service.addAssignment(lider, "slot1", { personId: "p-mem" }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
