import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { GroupsService } from "./groups.service";
import type { AuthUser } from "../auth/types/auth-user";

describe("GroupsService", () => {
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

  const now = new Date("2026-11-05T12:00:00Z");

  const groupRow = {
    id: "g1",
    organizationId: pilot.organizationId,
    churchId: pilot.churchId,
    name: "Célula Norte",
    leaderPersonId: "p-leader" as string | null,
    meetsAtHint: "Quarta 20h" as string | null,
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

  it("forbids MEMBRO from creating small groups", async () => {
    const service = new GroupsService(
      { $transaction: jest.fn() } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      service.create(membro, { name: "Célula Norte" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("creates small group for secretaria and audits", async () => {
    const tx = {
      smallGroup: {
        create: jest.fn().mockResolvedValue({
          ...groupRow,
          leaderPersonId: null,
          meetsAtHint: null,
        }),
      },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      person: { findFirst: jest.fn().mockResolvedValue({ id: "p-leader" }) },
      ...withTx(tx),
    };
    const service = new GroupsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    const result = await service.create(secretaria, {
      name: " Célula Norte ",
      leaderPersonId: "p-leader",
      meetsAtHint: " Quarta 20h ",
    });
    expect(result.id).toBe("g1");
    expect(result.name).toBe("Célula Norte");
    expect(tx.auditLog.create).toHaveBeenCalled();
  });

  it("rejects empty name and missing leader person", async () => {
    const prisma = {
      person: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(),
    };
    const service = new GroupsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      service.create(secretaria, { name: "  " }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.create(secretaria, {
        name: "Célula",
        leaderPersonId: "missing",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("lists groups with members", async () => {
    const prisma = {
      smallGroup: {
        findMany: jest.fn().mockResolvedValue([
          {
            ...groupRow,
            members: [
              {
                id: "gm1",
                personId: "p1",
                role: "MEMBER",
                joinedAt: now,
              },
            ],
          },
        ]),
      },
    };
    const service = new GroupsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const result = await service.list(secretaria);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].members[0].joinedAt).toBe(now.toISOString());
  });

  it("forbids MEMBRO from listing", async () => {
    const service = new GroupsService(
      { smallGroup: { findMany: jest.fn() } } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(service.list(membro)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("adds member with role validation", async () => {
    const tx = {
      smallGroupMember: {
        create: jest.fn().mockResolvedValue({
          id: "gm1",
          groupId: "g1",
          personId: "p1",
          role: "LEADER",
          joinedAt: now,
        }),
      },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      smallGroup: { findFirst: jest.fn().mockResolvedValue(groupRow) },
      person: { findFirst: jest.fn().mockResolvedValue({ id: "p1" }) },
      ...withTx(tx),
    };
    const service = new GroupsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    await expect(
      service.addMember(secretaria, "g1", { personId: "p1", role: "BOSS" }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const result = await service.addMember(secretaria, "g1", {
      personId: "p1",
      role: "LEADER",
    });
    expect(result.role).toBe("LEADER");
    expect(result.joinedAt).toBe(now.toISOString());
  });

  it("defaults member role to MEMBER and 404s missing group", async () => {
    const tx = {
      smallGroupMember: {
        create: jest.fn().mockResolvedValue({
          id: "gm2",
          groupId: "g1",
          personId: "p1",
          role: "MEMBER",
          joinedAt: now,
        }),
      },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      smallGroup: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(groupRow),
      },
      person: { findFirst: jest.fn().mockResolvedValue({ id: "p1" }) },
      ...withTx(tx),
    };
    const service = new GroupsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    await expect(
      service.addMember(secretaria, "missing", { personId: "p1" }),
    ).rejects.toBeInstanceOf(NotFoundException);

    const result = await service.addMember(secretaria, "g1", {
      personId: "p1",
    });
    expect(result.role).toBe("MEMBER");
  });

  it("creates meeting with attendance", async () => {
    const tx = {
      groupMeeting: {
        create: jest.fn().mockResolvedValue({
          id: "meet1",
          groupId: "g1",
          occurredAt: now,
          notes: "ok",
          createdAt: now,
          attendances: [
            { id: "att1", personId: "p1", present: true },
            { id: "att2", personId: "p2", present: false },
          ],
        }),
      },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      smallGroup: { findFirst: jest.fn().mockResolvedValue(groupRow) },
      person: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: "p1" }, { id: "p2" }]),
      },
      ...withTx(tx),
    };
    const service = new GroupsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    const result = await service.createMeeting(secretaria, "g1", {
      occurredAt: "2026-11-05T20:00:00Z",
      notes: " ok ",
      attendance: [
        { personId: "p1" },
        { personId: "p2", present: false },
      ],
    });
    expect(result.id).toBe("meet1");
    expect(result.attendance).toHaveLength(2);
    expect(tx.auditLog.create).toHaveBeenCalled();
  });

  it("creates meeting without attendance", async () => {
    const tx = {
      groupMeeting: {
        create: jest.fn().mockResolvedValue({
          id: "meet2",
          groupId: "g1",
          occurredAt: now,
          notes: null,
          createdAt: now,
          attendances: [],
        }),
      },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      smallGroup: { findFirst: jest.fn().mockResolvedValue(groupRow) },
      person: { findMany: jest.fn() },
      ...withTx(tx),
    };
    const service = new GroupsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const result = await service.createMeeting(secretaria, "g1", {
      occurredAt: "2026-11-05T20:00:00Z",
    });
    expect(result.attendance).toEqual([]);
    expect(prisma.person.findMany).not.toHaveBeenCalled();
  });

  it("rejects invalid occurredAt and unknown attendance persons", async () => {
    const prisma = {
      smallGroup: { findFirst: jest.fn().mockResolvedValue(groupRow) },
      person: {
        findMany: jest.fn().mockResolvedValue([{ id: "p1" }]),
      },
      $transaction: jest.fn(),
    };
    const service = new GroupsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    await expect(
      service.createMeeting(secretaria, "g1", { occurredAt: "bad" }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.createMeeting(secretaria, "g1", {
        occurredAt: "2026-11-05T20:00:00Z",
        attendance: [{ personId: "p1" }, { personId: "p-missing" }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
