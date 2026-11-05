import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { TransfersService } from "./transfers.service";
import type { AuthUser } from "../auth/types/auth-user";

describe("TransfersService", () => {
  const pilot = {
    organizationId: "org1",
    churchId: "church-rf1",
    organizationSlug: "igreja-de-deus",
    churchSlug: "riacho-fundo-1",
    churchName: "RF1",
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

  const baseRow = {
    id: "t1",
    personId: "p1",
    organizationId: pilot.organizationId,
    fromChurchId: pilot.churchId,
    toChurchId: "church-other",
    fromMembershipId: "m1",
    toMembershipId: null as string | null,
    status: "AWAITING_ORIGIN",
    notes: null as string | null,
    rejectionReason: null as string | null,
    createdAt: new Date("2026-11-05T00:00:00Z"),
    completedAt: null as Date | null,
  };

  it("forbids membro", async () => {
    const service = new TransfersService(
      {} as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(service.list(membro)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("lists transfers for secretaria", async () => {
    const prisma = {
      membershipTransfer: {
        findMany: jest.fn().mockResolvedValue([baseRow]),
      },
    };
    const service = new TransfersService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(service.list(secretaria)).resolves.toMatchObject({
      churchId: pilot.churchId,
      transfers: [{ id: "t1" }],
    });
  });

  it("creates transfer for ACTIVE membership", async () => {
    const prisma = {
      church: {
        findFirst: jest.fn().mockResolvedValue({ id: "church-other" }),
      },
      churchMembership: {
        findFirst: jest.fn().mockResolvedValue({
          id: "m1",
          personId: "p1",
          churchId: pilot.churchId,
        }),
      },
      membershipTransfer: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(baseRow),
      },
      auditLog: { create: jest.fn() },
    };
    const service = new TransfersService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      service.create(secretaria, {
        personId: "p1",
        toChurchId: "church-other",
        notes: "demo",
      }),
    ).resolves.toMatchObject({ id: "t1", status: "AWAITING_ORIGIN" });
  });

  it("rejects create to same church or missing dest", async () => {
    const prisma = {
      church: { findFirst: jest.fn().mockResolvedValue(null) },
      churchMembership: { findFirst: jest.fn() },
      membershipTransfer: { findFirst: jest.fn() },
    };
    const service = new TransfersService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      service.create(secretaria, {
        personId: "p1",
        toChurchId: pilot.churchId,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create(secretaria, {
        personId: "p1",
        toChurchId: "missing",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("404 when membership or get missing; 409 when open transfer", async () => {
    const prisma = {
      church: {
        findFirst: jest.fn().mockResolvedValue({ id: "church-other" }),
      },
      churchMembership: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValue({ id: "m1" }),
      },
      membershipTransfer: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(baseRow)
          .mockResolvedValueOnce(null),
      },
    };
    const service = new TransfersService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      service.create(secretaria, {
        personId: "p1",
        toChurchId: "church-other",
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    await expect(
      service.create(secretaria, {
        personId: "p1",
        toChurchId: "church-other",
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    await expect(service.getById(secretaria, "x")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("advances origin approve then completes destination", async () => {
    const awaitingDest = {
      ...baseRow,
      status: "AWAITING_DESTINATION",
      approvedOriginAt: new Date(),
    };
    const completed = {
      ...awaitingDest,
      status: "COMPLETED",
      toMembershipId: "m2",
      completedAt: new Date("2026-11-05T01:00:00Z"),
    };
    const prisma = {
      membershipTransfer: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(baseRow)
          .mockResolvedValueOnce(awaitingDest),
        update: jest
          .fn()
          .mockResolvedValueOnce(awaitingDest)
          .mockResolvedValueOnce(completed),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          churchMembership: {
            update: jest.fn(),
            upsert: jest.fn().mockResolvedValue({ id: "m2" }),
          },
          memberCredential: { updateMany: jest.fn() },
          person: { update: jest.fn() },
          membershipTransfer: {
            update: jest.fn().mockResolvedValue(completed),
          },
        };
        return fn(tx);
      }),
      auditLog: { create: jest.fn() },
    };
    const service = new TransfersService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    await expect(
      service.advance(secretaria, "t1", { decision: "APPROVE" }),
    ).resolves.toMatchObject({ status: "AWAITING_DESTINATION" });

    await expect(
      service.advance(secretaria, "t1", { decision: "APPROVE" }),
    ).resolves.toMatchObject({ status: "COMPLETED", toMembershipId: "m2" });
  });

  it("rejects transfer", async () => {
    const prisma = {
      membershipTransfer: {
        findFirst: jest.fn().mockResolvedValue(baseRow),
        update: jest.fn().mockResolvedValue({
          ...baseRow,
          status: "REJECTED",
          rejectionReason: "Não",
        }),
      },
      auditLog: { create: jest.fn() },
    };
    const service = new TransfersService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      service.advance(secretaria, "t1", {
        decision: "REJECT",
        rejectionReason: "Não",
      }),
    ).resolves.toMatchObject({ status: "REJECTED" });
  });

  it("blocks advance on closed transfer", async () => {
    const prisma = {
      membershipTransfer: {
        findFirst: jest.fn().mockResolvedValue({
          ...baseRow,
          status: "COMPLETED",
        }),
      },
    };
    const service = new TransfersService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      service.advance(secretaria, "t1", { decision: "APPROVE" }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
