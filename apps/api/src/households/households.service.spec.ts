import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { HouseholdsService } from "./households.service";
import type { AuthUser } from "../auth/types/auth-user";

describe("HouseholdsService", () => {
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

  const memberOnly: AuthUser = {
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

  function buildTx(overrides: Record<string, unknown> = {}) {
    return {
      person: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn(),
      },
      household: {
        create: jest.fn().mockResolvedValue({
          id: "h1",
          label: "Família Demo",
          churchId: pilot.churchId,
          organizationId: pilot.organizationId,
          createdAt: new Date("2026-11-04T12:00:00Z"),
        }),
        findFirst: jest.fn(),
      },
      auditLog: { create: jest.fn() },
      ...overrides,
    };
  }

  it("forbids create for membro", async () => {
    const service = new HouseholdsService(
      { $transaction: jest.fn() } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(service.create(memberOnly, {})).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("creates household and links members", async () => {
    const tx = buildTx({
      person: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "p1",
            displayName: "Ana Demo",
            isMinor: false,
            legalGuardianPersonId: null,
          },
        ]),
        updateMany: jest.fn(),
      },
    });
    const prisma = {
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
      household: { findFirst: jest.fn() },
    };
    const service = new HouseholdsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    const result = await service.create(secretaria, {
      label: " Família Demo ",
      memberPersonIds: ["p1", "p1"],
    });
    expect(result.id).toBe("h1");
    expect(result.memberPersonIds).toEqual(["p1"]);
    expect(result.members).toEqual([
      { id: "p1", displayName: "Ana Demo", isMinor: false },
    ]);
    expect(tx.person.updateMany).toHaveBeenCalled();
    expect(tx.auditLog.create).toHaveBeenCalled();
  });

  it("rejects unknown members and minors without guardian", async () => {
    const txMissing = buildTx({
      person: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn(),
      },
    });
    const prisma = {
      $transaction: jest.fn(async (fn: (t: typeof txMissing) => Promise<unknown>) =>
        fn(txMissing),
      ),
    };
    const service = new HouseholdsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      service.create(secretaria, { memberPersonIds: ["ghost"] }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const txMinor = buildTx({
      person: {
        findMany: jest.fn().mockResolvedValue([
          { id: "kid", isMinor: true, legalGuardianPersonId: null },
        ]),
        updateMany: jest.fn(),
      },
    });
    prisma.$transaction = jest.fn(async (fn) => fn(txMinor));
    await expect(
      service.create(secretaria, { memberPersonIds: ["kid"] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("lists households for secretaria", async () => {
    const prisma = {
      household: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "h1",
            label: "Demo",
            churchId: pilot.churchId,
            organizationId: pilot.organizationId,
            createdAt: new Date("2026-11-04T12:00:00Z"),
            persons: [{ id: "p1", displayName: "A", isMinor: false }],
          },
        ]),
      },
    };
    const service = new HouseholdsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(service.list(secretaria)).resolves.toMatchObject({
      churchId: pilot.churchId,
      households: [{ id: "h1", memberPersonIds: ["p1"] }],
    });
    await expect(service.list(memberOnly)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("getById returns household or 404 / forbidden", async () => {
    const prisma = {
      household: {
        findFirst: jest.fn().mockResolvedValue({
          id: "h1",
          label: "Demo",
          churchId: pilot.churchId,
          organizationId: pilot.organizationId,
          createdAt: new Date("2026-11-04T12:00:00Z"),
          persons: [{ id: "p1", displayName: "Ana", isMinor: false }],
        }),
      },
    };
    const service = new HouseholdsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    await expect(service.getById(secretaria, "h1")).resolves.toMatchObject({
      id: "h1",
      memberPersonIds: ["p1"],
    });

    await expect(service.getById(memberOnly, "h1")).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    prisma.household.findFirst.mockResolvedValue(null);
    await expect(service.getById(secretaria, "x")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("addMembers and removeMember", async () => {
    const householdRow = {
      id: "h1",
      label: "Demo",
      churchId: pilot.churchId,
      organizationId: pilot.organizationId,
      createdAt: new Date("2026-11-04T12:00:00Z"),
      persons: [{ id: "p2", displayName: "B", isMinor: false }],
    };
    const tx = {
      person: {
        findMany: jest.fn().mockResolvedValue([
          { id: "p2", isMinor: false, legalGuardianPersonId: null },
        ]),
        updateMany: jest.fn(),
      },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => {
        await fn(tx);
      }),
      household: {
        findFirst: jest.fn().mockResolvedValue(householdRow),
      },
      person: {
        findFirst: jest.fn().mockResolvedValue({
          id: "p2",
          organizationId: pilot.organizationId,
          householdId: "h1",
        }),
        update: jest.fn(),
      },
      auditLog: { create: jest.fn() },
    };
    const service = new HouseholdsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    await expect(
      service.addMembers(secretaria, "h1", ["p2"]),
    ).resolves.toMatchObject({ id: "h1" });
    expect(tx.person.updateMany).toHaveBeenCalled();
    await expect(
      service.removeMember(secretaria, "h1", "p2"),
    ).resolves.toMatchObject({ id: "h1" });
    expect(prisma.person.update).toHaveBeenCalled();
  });
});
