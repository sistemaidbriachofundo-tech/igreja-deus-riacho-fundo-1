import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
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
  const serviceAt = new Date("2026-11-09T19:00:00Z");

  it("forbids MEMBRO from creating ministries", async () => {
    const service = new MinistriesService(
      { $transaction: jest.fn() } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      service.createMinistry(membro, { name: "Louvor", slug: "louvor" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("creates ministry for líder and audits", async () => {
    const tx = {
      ministry: {
        create: jest.fn().mockResolvedValue({
          id: "m1",
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          name: "Louvor",
          slug: "louvor",
          leaderPersonId: null,
          createdAt: now,
          updatedAt: now,
        }),
      },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    };
    const service = new MinistriesService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    const result = await service.createMinistry(lider, {
      name: " Louvor ",
      slug: "Louvor",
    });
    expect(result.id).toBe("m1");
    expect(result.slug).toBe("louvor");
    expect(tx.auditLog.create).toHaveBeenCalled();
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
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    };
    const service = new MinistriesService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    const result = await service.confirmAssignment(membro, "a1");
    expect(result.status).toBe("CONFIRMED");
    expect(tx.auditLog.create).toHaveBeenCalled();
  });
});
