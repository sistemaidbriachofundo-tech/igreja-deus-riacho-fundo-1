import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { BusinessException } from "../common/business.exception";
import type { AuthUser } from "../auth/types/auth-user";
import { MembershipsService } from "./memberships.service";

describe("MembershipsService notes patch", () => {
  const pilot = {
    organizationId: "org1",
    churchId: "church-rf1",
    organizationSlug: "igreja-de-deus",
    churchSlug: "riacho-fundo-1",
    churchName: "Riacho Fundo I (demo)",
  };
  const updatedAt = new Date("2026-11-02T00:00:00.000Z");
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

  function actor(roleCode: string, churchId = "church-rf1"): AuthUser {
    return {
      userId: `u-${roleCode}`,
      personId: `p-${roleCode}`,
      email: `${roleCode.toLowerCase()}@example.test`,
      grants: roleCode
        ? [{ roleCode, organizationId: "org1", churchId }]
        : [],
    };
  }

  function membership(overrides: Record<string, unknown> = {}) {
    return {
      id: "m1",
      personId: "p1",
      churchId: "church-rf1",
      organizationId: "org1",
      status: "PENDING_ADMISSION",
      joinedAt: new Date("2026-01-01T00:00:00.000Z"),
      leftAt: null,
      notes: "observação antiga",
      updatedAt,
      ...overrides,
    };
  }

  function build() {
    const prisma = {
      churchMembership: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      person: { update: jest.fn(), updateMany: jest.fn() },
      household: { create: jest.fn() },
      auditLog: { create: jest.fn().mockResolvedValue({ id: "audit-1" }) },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) =>
      fn(prisma),
    );
    const service = new MembershipsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    return { service, prisma };
  }

  async function codeOf(run: Promise<unknown>) {
    const error = await run.then(
      () => null,
      (err) => err,
    );
    expect(error).toBeInstanceOf(BusinessException);
    return (error as BusinessException).getResponse() as { code: string; statusCode: number };
  }

  it("grava só a observação e preserva a situação", async () => {
    const { service, prisma } = build();
    prisma.churchMembership.findFirst
      .mockResolvedValueOnce(membership())
      .mockResolvedValueOnce(
        membership({
          notes: "Família conferida no culto",
          updatedAt: new Date("2026-11-02T00:00:03.000Z"),
        }),
      );

    const result = await service.patch(secretaria, "m1", {
      notes: "  Família conferida no culto  ",
      expectedUpdatedAt: updatedAt.toISOString(),
    });

    expect(result).toMatchObject({
      id: "m1",
      status: "PENDING_ADMISSION",
      notes: "Família conferida no culto",
      updatedAt: "2026-11-02T00:00:03.000Z",
    });
    expect(prisma.churchMembership.updateMany).toHaveBeenCalledWith({
      where: {
        id: "m1",
        organizationId: "org1",
        churchId: "church-rf1",
        updatedAt,
      },
      data: { notes: "Família conferida no culto" },
    });
    expect(prisma.churchMembership.update).not.toHaveBeenCalled();
    expect(prisma.person.update).not.toHaveBeenCalled();
    expect(prisma.person.updateMany).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "membership.notes.patch",
          metadata: {
            fields: ["notes"],
            before: { notes: "observação antiga" },
            after: { notes: "Família conferida no culto" },
            status: "PENDING_ADMISSION",
          },
        }),
      }),
    );
  });

  it("recusa situação e saída sem fluxo regulado", async () => {
    const { service, prisma } = build();
    expect(
      (await codeOf(service.patch(secretaria, "m1", { status: "ACTIVE", notes: "x" })))
        .code,
    ).toBe("MEMBERSHIP_STATUS_REGULATED");
    expect(
      (await codeOf(service.patch(secretaria, "m1", { status: "INACTIVE" }))).code,
    ).toBe("MEMBERSHIP_STATUS_REGULATED");
    expect(
      (await codeOf(service.patch(secretaria, "m1", { status: "TRANSFERRED" }))).code,
    ).toBe("MEMBERSHIP_STATUS_REGULATED");
    expect(
      (await codeOf(service.patch(secretaria, "m1", { leftAt: "2026-11-02T00:00:00.000Z" })))
        .code,
    ).toBe("MEMBERSHIP_LEFT_AT_REGULATED");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("restringe o piloto e a versão", async () => {
    const { service, prisma } = build();
    const noGrant: AuthUser = {
      userId: "u-tech",
      personId: "p-tech",
      email: "tech@example.test",
      grants: [],
    };
    await expect(service.patch(noGrant, "m1", { notes: "x" })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      service.patch(actor("PASTOR"), "m1", { notes: "x" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.patch(actor("PLATFORM_ADMIN", "church-other"), "m1", { notes: "x" }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    prisma.churchMembership.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.patch(secretaria, "m-other", { notes: "x" }),
    ).rejects.toBeInstanceOf(NotFoundException);

    prisma.churchMembership.findFirst.mockResolvedValueOnce(membership());
    const stale = await codeOf(
      service.patch(secretaria, "m1", {
        notes: "nova",
        expectedUpdatedAt: "2020-01-01T00:00:00.000Z",
      }),
    );
    expect(stale).toMatchObject({
      code: "MEMBERSHIP_VERSION_CONFLICT",
      statusCode: 409,
    });

    prisma.churchMembership.findFirst.mockResolvedValueOnce(membership());
    prisma.churchMembership.updateMany.mockResolvedValueOnce({ count: 0 });
    const lost = await codeOf(service.patch(secretaria, "m1", { notes: "nova" }));
    expect(lost.code).toBe("MEMBERSHIP_VERSION_CONFLICT");
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("limpa observação em branco e ignora texto idêntico", async () => {
    const { service, prisma } = build();
    prisma.churchMembership.findFirst
      .mockResolvedValueOnce(membership())
      .mockResolvedValueOnce(membership({ notes: null }));
    await expect(
      service.patch(secretaria, "m1", { notes: "   " }),
    ).resolves.toMatchObject({ notes: null, status: "PENDING_ADMISSION" });

    prisma.churchMembership.findFirst.mockResolvedValueOnce(membership());
    await expect(
      service.patch(secretaria, "m1", { notes: "observação antiga" }),
    ).resolves.toMatchObject({ notes: "observação antiga" });
    expect(prisma.churchMembership.updateMany).toHaveBeenCalledTimes(1);

    const long = await codeOf(
      service.patch(secretaria, "m1", { notes: "a".repeat(4001) }),
    );
    expect(long.code).toBe("MEMBERSHIP_NOTES_INVALID");
  });
});
