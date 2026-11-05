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

  const now = new Date("2026-11-05T00:00:00Z");

  const baseTransfer = {
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
    createdAt: now,
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
        findMany: jest.fn().mockResolvedValue([baseTransfer]),
      },
    };
    const service = new TransfersService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const result = await service.list(secretaria);
    expect(result.transfers).toHaveLength(1);
    expect(result.transfers[0].createdAt).toBe(now.toISOString());
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
        create: jest.fn().mockResolvedValue(baseTransfer),
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
        notes: "  move  ",
      }),
    ).resolves.toMatchObject({ id: "t1", status: "AWAITING_ORIGIN" });
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });

  it("rejects create validation errors", async () => {
    const prisma = {
      church: { findFirst: jest.fn() },
      churchMembership: { findFirst: jest.fn() },
      membershipTransfer: {
        findFirst: jest.fn(),
        create: jest.fn(),
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
        toChurchId: pilot.churchId,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.church.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.create(secretaria, {
        personId: "p1",
        toChurchId: "missing",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.church.findFirst.mockResolvedValueOnce({ id: "church-other" });
    prisma.churchMembership.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.create(secretaria, {
        personId: "p1",
        toChurchId: "church-other",
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    prisma.church.findFirst.mockResolvedValueOnce({ id: "church-other" });
    prisma.churchMembership.findFirst.mockResolvedValueOnce({ id: "m1" });
    prisma.membershipTransfer.findFirst.mockResolvedValueOnce({ id: "open" });
    await expect(
      service.create(secretaria, {
        personId: "p1",
        toChurchId: "church-other",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("404 when get missing", async () => {
    const prisma = {
      membershipTransfer: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new TransfersService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(service.getById(secretaria, "x")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("gets transfer by id", async () => {
    const prisma = {
      membershipTransfer: {
        findFirst: jest.fn().mockResolvedValue({
          ...baseTransfer,
          completedAt: now,
        }),
      },
    };
    const service = new TransfersService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(service.getById(secretaria, "t1")).resolves.toMatchObject({
      id: "t1",
      completedAt: now.toISOString(),
    });
  });

  it("advances APPROVE origin → destination → complete", async () => {
    const awaitingDest = {
      ...baseTransfer,
      status: "AWAITING_DESTINATION",
    };
    const completed = {
      ...baseTransfer,
      status: "COMPLETED",
      toMembershipId: "m-dest",
      completedAt: now,
    };

    const tx = {
      churchMembership: {
        update: jest.fn(),
        upsert: jest.fn().mockResolvedValue({ id: "m-dest" }),
      },
      memberCredential: { updateMany: jest.fn() },
      person: { update: jest.fn() },
      membershipTransfer: {
        update: jest.fn().mockResolvedValue(completed),
      },
    };

    const prisma = {
      membershipTransfer: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(baseTransfer)
          .mockResolvedValueOnce(awaitingDest),
        update: jest.fn().mockResolvedValue(awaitingDest),
      },
      auditLog: { create: jest.fn() },
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    };
    const service = new TransfersService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    const origin = await service.advance(secretaria, "t1", {
      decision: "APPROVE",
    });
    expect(origin.status).toBe("AWAITING_DESTINATION");
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "transfer.approve_origin" }),
      }),
    );

    const done = await service.advance(secretaria, "t1", {
      decision: "APPROVE",
    });
    expect(done.status).toBe("COMPLETED");
    expect(done.toMembershipId).toBe("m-dest");
    expect(tx.churchMembership.update).toHaveBeenCalled();
    expect(tx.memberCredential.updateMany).toHaveBeenCalled();
    expect(tx.person.update).toHaveBeenCalled();
  });

  it("advances REJECT with reason", async () => {
    const prisma = {
      membershipTransfer: {
        findFirst: jest.fn().mockResolvedValue(baseTransfer),
        update: jest.fn().mockResolvedValue({
          ...baseTransfer,
          status: "REJECTED",
          rejectionReason: "Não aprovado",
        }),
      },
      auditLog: { create: jest.fn() },
    };
    const service = new TransfersService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    const result = await service.advance(secretaria, "t1", {
      decision: "REJECT",
      rejectionReason: " Não aprovado ",
    });
    expect(result.status).toBe("REJECTED");
    expect(result.rejectionReason).toBe("Não aprovado");
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "transfer.reject" }),
      }),
    );
  });

  it("rejects advance errors (missing, closed, wrong step)", async () => {
    const prisma = {
      membershipTransfer: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ ...baseTransfer, status: "COMPLETED" })
          .mockResolvedValueOnce({
            ...baseTransfer,
            status: "AWAITING_ORIGIN",
            fromChurchId: "other-origin",
          }),
        update: jest.fn(),
      },
      auditLog: { create: jest.fn() },
      $transaction: jest.fn(),
    };
    const service = new TransfersService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    await expect(
      service.advance(secretaria, "missing", { decision: "APPROVE" }),
    ).rejects.toBeInstanceOf(NotFoundException);

    await expect(
      service.advance(secretaria, "t1", { decision: "APPROVE" }),
    ).rejects.toBeInstanceOf(ConflictException);

    await expect(
      service.advance(secretaria, "t1", { decision: "APPROVE" }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("REJECT defaults rejectionReason when omitted", async () => {
    const prisma = {
      membershipTransfer: {
        findFirst: jest.fn().mockResolvedValue(baseTransfer),
        update: jest.fn().mockImplementation(async ({ data }) => ({
          ...baseTransfer,
          ...data,
        })),
      },
      auditLog: { create: jest.fn() },
    };
    const service = new TransfersService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const result = await service.advance(secretaria, "t1", {
      decision: "REJECT",
    });
    expect(result.rejectionReason).toBe("Rejeitada");
  });
});
