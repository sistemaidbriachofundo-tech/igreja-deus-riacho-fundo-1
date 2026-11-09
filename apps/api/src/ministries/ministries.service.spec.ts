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

  /** RF-014: defaults “sem janelas / sem impedimento”. */
  function schedulableOk() {
    return {
      volunteerAvailability: { findMany: jest.fn().mockResolvedValue([]) },
      volunteerImpediment: { findFirst: jest.fn().mockResolvedValue(null) },
      rosterCoupleException: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
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
    await expect(service.createRoster(lider, {
      title: "Especial",
      serviceAt: serviceAt.toISOString(),
    })).rejects.toBeInstanceOf(ForbiddenException);
    const result = await service.createRoster(secretaria, {
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
            ministryId: "m1",
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
      ...schedulableOk(),
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
            ministryId: "m1",
            serviceAt,
          },
        }),
      },
      person: {
        findFirst: jest.fn().mockResolvedValue({ id: "p-mem" }),
      },
      rosterAssignment: { findMany: jest.fn().mockResolvedValue([]) },
      ...schedulableOk(),
      $transaction: jest.fn(),
    };
    const service = new MinistriesService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    await expect(
      service.addAssignment(lider, "slot1", { personId: "p-mem" }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "COUPLE_REQUIRED" }),
    });
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
            ministryId: "m1",
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
      ...schedulableOk(),
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
              ministryId: "m1",
              serviceAt,
            },
          }),
      },
      person: { findFirst: jest.fn().mockResolvedValue(null) },
      rosterAssignment: { findMany: jest.fn().mockResolvedValue([]) },
      ...schedulableOk(),
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
          ministryId: "m1",
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
          ministryId: "m1",
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
          ministryId: "m1",
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
          ministryId: "m1",
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
      ...schedulableOk(),
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
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "COUPLE_REQUIRED" }),
    });

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
          ministryId: "m1",
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
      ...schedulableOk(),
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
          ministryId: "m1",
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

  it("allows solo assignment on requiresCouple with APPROVED exception", async () => {
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
            ministryId: "m1",
            serviceAt,
          },
        }),
      },
      person: { findFirst: jest.fn().mockResolvedValue({ id: "p-mem" }) },
      rosterAssignment: { findMany: jest.fn().mockResolvedValue([]) },
      volunteerAvailability: { findMany: jest.fn().mockResolvedValue([]) },
      volunteerImpediment: { findFirst: jest.fn().mockResolvedValue(null) },
      rosterCoupleException: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "ex1",
            personId: "p-mem",
            status: "APPROVED",
            slotId: "slot1",
            rosterId: null,
            ministryId: null,
          },
        ]),
        findFirst: jest.fn(),
      },
      ...withTx(tx),
    };
    const service = new MinistriesService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const result = await service.addAssignment(lider, "slot1", {
      personId: "p-mem",
    });
    expect(result.id).toBe("a1");
  });

  it("blocks assignment on impediment and outside availability windows", async () => {
    const baseSlot = {
      id: "slot1",
      rosterId: "r1",
      roleLabel: "Voz",
      requiresCouple: false,
      sortOrder: 0,
      roster: {
        id: "r1",
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        ministryId: "m1",
        serviceAt,
      },
    };
    const prismaImp = {
      rosterSlot: { findFirst: jest.fn().mockResolvedValue(baseSlot) },
      person: { findFirst: jest.fn().mockResolvedValue({ id: "p-mem" }) },
      volunteerAvailability: { findMany: jest.fn().mockResolvedValue([]) },
      volunteerImpediment: {
        findFirst: jest.fn().mockResolvedValue({ id: "imp1" }),
      },
      $transaction: jest.fn(),
    };
    const serviceImp = new MinistriesService(
      prismaImp as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      serviceImp.addAssignment(lider, "slot1", { personId: "p-mem" }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "ROSTER_IMPEDIMENT" }),
    });

    // serviceAt = 2026-11-09T19:00:00Z → weekday=1 (Mon), minute=1140
    const prismaAvail = {
      rosterSlot: { findFirst: jest.fn().mockResolvedValue(baseSlot) },
      person: { findFirst: jest.fn().mockResolvedValue({ id: "p-mem" }) },
      volunteerAvailability: {
        findMany: jest.fn().mockResolvedValue([
          {
            weekday: 0,
            startMinute: 0,
            endMinute: 60,
          },
        ]),
      },
      volunteerImpediment: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(),
    };
    const serviceAvail = new MinistriesService(
      prismaAvail as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      serviceAvail.addAssignment(lider, "slot1", { personId: "p-mem" }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "ROSTER_UNAVAILABLE" }),
    });
  });

  it("simulates and approves couple exception", async () => {
    const pending = {
      id: "ex1",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      ministryId: null,
      rosterId: null,
      slotId: "slot1",
      personId: "p-mem",
      reason: "viúvo",
      status: "PENDING",
      simulation: true,
      requestedByUserId: lider.userId,
      reviewedByUserId: null,
      reviewedAt: null,
      notes: null,
      createdAt: now,
      updatedAt: now,
    };
    const approved = {
      ...pending,
      status: "APPROVED",
      reviewedByUserId: lider.userId,
      reviewedAt: now,
    };
    const createTx = {
      rosterCoupleException: { create: jest.fn().mockResolvedValue(pending) },
      auditLog: { create: jest.fn() },
    };
    const approveTx = {
      rosterCoupleException: { update: jest.fn().mockResolvedValue(approved) },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      person: { findFirst: jest.fn().mockResolvedValue({ id: "p-mem" }) },
      rosterSlot: {
        findFirst: jest.fn().mockResolvedValue({
          id: "slot1",
          roster: {
            organizationId: pilot.organizationId,
            churchId: pilot.churchId,
          },
        }),
      },
      rosterCoupleException: {
        findFirst: jest.fn().mockResolvedValue(pending),
      },
      $transaction: jest
        .fn()
        .mockImplementationOnce(async (fn: (t: typeof createTx) => unknown) =>
          fn(createTx),
        )
        .mockImplementationOnce(async (fn: (t: typeof approveTx) => unknown) =>
          fn(approveTx),
        ),
    };
    const service = new MinistriesService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const sim = await service.simulateCoupleException(lider, {
      personId: "p-mem",
      reason: "viúvo",
      slotId: "slot1",
    });
    expect(sim.status).toBe("PENDING");
    expect(sim.simulation).toBe(true);

    const ok = await service.approveCoupleException(lider, "ex1");
    expect(ok.status).toBe("APPROVED");
  });

  it("creates availability / impediment and enqueues confirm alert", async () => {
    const avail = {
      id: "av1",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      personId: "p-mem",
      weekday: 1,
      startMinute: 1080,
      endMinute: 1200,
      notes: null,
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    const availTx = {
      volunteerAvailability: { create: jest.fn().mockResolvedValue(avail) },
      auditLog: { create: jest.fn() },
    };
    const imp = {
      id: "imp1",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      personId: "p-mem",
      startsAt: new Date("2026-11-09T00:00:00Z"),
      endsAt: new Date("2026-11-10T00:00:00Z"),
      reason: "viagem",
      createdByUserId: lider.userId,
      createdAt: now,
      updatedAt: now,
    };
    const impTx = {
      volunteerImpediment: { create: jest.fn().mockResolvedValue(imp) },
      auditLog: { create: jest.fn() },
    };

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
          ministryId: "m1",
          title: "Culto",
          serviceAt,
        },
      },
    };
    const confirmTx = {
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
      person: { findFirst: jest.fn().mockResolvedValue({ id: "p-mem" }) },
      rosterAssignment: {
        findFirst: jest.fn().mockResolvedValue(assignment),
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest
        .fn()
        .mockImplementationOnce(async (fn: (t: typeof availTx) => unknown) =>
          fn(availTx),
        )
        .mockImplementationOnce(async (fn: (t: typeof impTx) => unknown) =>
          fn(impTx),
        )
        .mockImplementationOnce(async (fn: (t: typeof confirmTx) => unknown) =>
          fn(confirmTx),
        ),
    };
    const channels = {
      enqueueRosterAlert: jest.fn().mockResolvedValue({
        notified: 1,
        outbox: [{ id: "o1" }],
        reused: false,
      }),
    };
    const service = new MinistriesService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
      channels as never,
    );

    const a = await service.createAvailability(lider, {
      personId: "p-mem",
      weekday: 1,
      startMinute: 1080,
      endMinute: 1200,
    });
    expect(a.active).toBe(true);

    const i = await service.createImpediment(lider, {
      personId: "p-mem",
      startsAt: "2026-11-09T00:00:00Z",
      endsAt: "2026-11-10T00:00:00Z",
      reason: "viagem",
    });
    expect(i.id).toBe("imp1");

    await service.confirmAssignment(membro, "a1");
    expect(channels.enqueueRosterAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        assignmentId: "a1",
        kind: "confirm",
        personId: "p-mem",
      }),
    );
  });

  it("lists/deactivates availability and lists/deletes impediments", async () => {
    const availRow = {
      id: "av1",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      personId: "p-mem",
      weekday: 1,
      startMinute: 0,
      endMinute: 60,
      notes: null,
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    const deactivated = { ...availRow, active: false };
    const impRow = {
      id: "imp1",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      personId: "p-mem",
      startsAt: new Date("2026-11-09T00:00:00Z"),
      endsAt: new Date("2026-11-10T00:00:00Z"),
      reason: "x",
      createdByUserId: lider.userId,
      createdAt: now,
      updatedAt: now,
    };
    const deactTx = {
      volunteerAvailability: {
        update: jest.fn().mockResolvedValue(deactivated),
      },
      auditLog: { create: jest.fn() },
    };
    const delTx = {
      volunteerImpediment: { delete: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      volunteerAvailability: {
        findMany: jest.fn().mockResolvedValue([availRow]),
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(availRow)
          .mockResolvedValueOnce(null),
      },
      volunteerImpediment: {
        findMany: jest.fn().mockResolvedValue([impRow]),
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(impRow)
          .mockResolvedValueOnce(null),
      },
      $transaction: jest
        .fn()
        .mockImplementationOnce(async (fn: (t: typeof deactTx) => unknown) =>
          fn(deactTx),
        )
        .mockImplementationOnce(async (fn: (t: typeof delTx) => unknown) =>
          fn(delTx),
        ),
    };
    const service = new MinistriesService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    const listed = await service.listAvailability(lider, "p-mem");
    expect(listed.availabilities).toHaveLength(1);
    expect(await service.deactivateAvailability(lider, "av1")).toMatchObject({
      active: false,
    });
    await expect(
      service.deactivateAvailability(lider, "missing"),
    ).rejects.toBeInstanceOf(NotFoundException);

    const imps = await service.listImpediments(lider, "p-mem");
    expect(imps.impediments).toHaveLength(1);
    expect(await service.deleteImpediment(lider, "imp1")).toEqual({
      deleted: true,
      id: "imp1",
    });
    await expect(
      service.deleteImpediment(lider, "missing"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("configures/lists/rejects couple exceptions and validates windows", async () => {
    const approved = {
      id: "ex2",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      ministryId: "m1",
      rosterId: null,
      slotId: null,
      personId: "p-mem",
      reason: "config",
      status: "APPROVED",
      simulation: false,
      requestedByUserId: lider.userId,
      reviewedByUserId: lider.userId,
      reviewedAt: now,
      notes: null,
      createdAt: now,
      updatedAt: now,
    };
    const pending = {
      ...approved,
      id: "ex3",
      status: "PENDING",
      simulation: true,
      reviewedByUserId: null,
      reviewedAt: null,
    };
    const rejected = {
      ...pending,
      status: "REJECTED",
      reviewedByUserId: lider.userId,
      reviewedAt: now,
    };
    const createTx = {
      rosterCoupleException: { create: jest.fn().mockResolvedValue(approved) },
      auditLog: { create: jest.fn() },
    };
    const rejectTx = {
      rosterCoupleException: { update: jest.fn().mockResolvedValue(rejected) },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      person: { findFirst: jest.fn().mockResolvedValue({ id: "p-mem" }) },
      ministry: { findFirst: jest.fn().mockResolvedValue(ministryRow) },
      rosterCoupleException: {
        findMany: jest.fn().mockResolvedValue([approved]),
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(pending)
          .mockResolvedValueOnce({ ...pending, status: "APPROVED" }),
      },
      $transaction: jest
        .fn()
        .mockImplementationOnce(async (fn: (t: typeof createTx) => unknown) =>
          fn(createTx),
        )
        .mockImplementationOnce(async (fn: (t: typeof rejectTx) => unknown) =>
          fn(rejectTx),
        ),
    };
    const service = new MinistriesService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    const cfg = await service.configureCoupleException(lider, {
      personId: "p-mem",
      reason: "config",
      ministryId: "m1",
    });
    expect(cfg.status).toBe("APPROVED");
    expect(cfg.simulation).toBe(false);

    const listed = await service.listCoupleExceptions(lider, {
      status: "APPROVED",
      personId: "p-mem",
    });
    expect(listed.exceptions).toHaveLength(1);

    expect(await service.rejectCoupleException(lider, "ex3")).toMatchObject({
      status: "REJECTED",
    });
    await expect(
      service.rejectCoupleException(lider, "ex3"),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "COUPLE_EXCEPTION_NOT_PENDING" }),
    });

    await expect(
      service.createAvailability(lider, {
        personId: "p-mem",
        weekday: 9,
        startMinute: 0,
        endMinute: 60,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createAvailability(lider, {
        personId: "p-mem",
        weekday: 1,
        startMinute: 100,
        endMinute: 50,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createImpediment(lider, {
        personId: "p-mem",
        startsAt: "nope",
        endsAt: "2026-11-10T00:00:00Z",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createImpediment(lider, {
        personId: "p-mem",
        startsAt: "2026-11-10T00:00:00Z",
        endsAt: "2026-11-09T00:00:00Z",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("uses coupleExceptionId, resends alerts, and soft-fails without channels", async () => {
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
    };
    const created = { ...assignment };
    const createTx = {
      rosterAssignment: { create: jest.fn().mockResolvedValue(created) },
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
            ministryId: "m1",
            serviceAt,
            title: "Culto",
          },
        }),
      },
      person: { findFirst: jest.fn().mockResolvedValue({ id: "p-mem" }) },
      rosterAssignment: {
        findFirst: jest.fn().mockResolvedValue({
          ...assignment,
          slot: {
            id: "slot1",
            requiresCouple: true,
            roster: {
              id: "r1",
              organizationId: pilot.organizationId,
              churchId: pilot.churchId,
              ministryId: "m1",
              title: "Culto",
              serviceAt,
            },
          },
        }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      volunteerAvailability: { findMany: jest.fn().mockResolvedValue([]) },
      volunteerImpediment: { findFirst: jest.fn().mockResolvedValue(null) },
      rosterCoupleException: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({
            id: "ex1",
            personId: "p-mem",
            status: "APPROVED",
            slotId: "slot1",
            rosterId: null,
            ministryId: null,
          })
          .mockResolvedValueOnce(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      ...withTx(createTx),
    };
    const channels = {
      enqueueRosterAlert: jest.fn().mockResolvedValue({
        notified: 1,
        outbox: [{ id: "o1" }],
        reused: true,
      }),
    };
    const withChannels = new MinistriesService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
      channels as never,
    );
    await expect(
      withChannels.addAssignment(lider, "slot1", {
        personId: "p-mem",
        coupleExceptionId: "ex1",
      }),
    ).resolves.toMatchObject({ id: "a1" });

    await expect(
      withChannels.addAssignment(lider, "slot1", {
        personId: "p-mem",
        coupleExceptionId: "bad",
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "COUPLE_EXCEPTION_INVALID" }),
    });

    const resent = await withChannels.resendAssignmentAlert(
      lider,
      "a1",
      "confirm_request",
    );
    expect(resent.reused).toBe(true);

    const noChannels = new MinistriesService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    expect(
      await noChannels.resendAssignmentAlert(lider, "a1", "confirm"),
    ).toEqual({ notified: 0, outbox: [], reused: false });
  });

  it("rejects simulate without reason and missing slot", async () => {
    const prisma = {
      person: { findFirst: jest.fn().mockResolvedValue({ id: "p-mem" }) },
      rosterSlot: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(),
    };
    const service = new MinistriesService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      service.simulateCoupleException(lider, {
        personId: "p-mem",
        reason: "  ",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.simulateCoupleException(lider, {
        personId: "p-mem",
        reason: "ok",
        slotId: "missing",
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
