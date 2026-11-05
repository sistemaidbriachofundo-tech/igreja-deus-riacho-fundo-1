import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { LettersService } from "./letters.service";
import type { AuthUser } from "../auth/types/auth-user";

describe("LettersService", () => {
  const pilot = {
    organizationId: "org1",
    churchId: "church-rf1",
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

  const pastor: AuthUser = {
    userId: "u-pas",
    personId: "p-pas",
    email: "pastor.demo@example.test",
    grants: [
      {
        roleCode: "PASTOR",
        organizationId: "org1",
        churchId: "church-rf1",
      },
    ],
  };

  const now = new Date("2026-11-05T00:00:00Z");

  const draftLetter = {
    id: "L1",
    personId: "p1",
    letterType: "RECOMENDACAO",
    status: "DRAFT",
    title: "Carta",
    bodyText: "Texto",
    version: 1,
    supersedesId: null as string | null,
    issuedAt: null as Date | null,
    revokedAt: null as Date | null,
    createdAt: now,
  };

  it("forbids pastor from issuing letters", async () => {
    const service = new LettersService(
      {} as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(service.list(pastor)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("lists letters optionally filtered by personId", async () => {
    const prisma = {
      churchLetter: {
        findMany: jest.fn().mockResolvedValue([draftLetter]),
      },
    };
    const service = new LettersService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    const all = await service.list(secretaria);
    expect(all.letters).toHaveLength(1);
    expect(prisma.churchLetter.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
        }),
      }),
    );

    await service.list(secretaria, "p1");
    expect(prisma.churchLetter.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ personId: "p1" }),
      }),
    );
  });

  it("creates versioned draft letter", async () => {
    const prisma = {
      person: { findFirst: jest.fn().mockResolvedValue({ id: "p1" }) },
      churchLetter: {
        findFirst: jest.fn().mockResolvedValue({ id: "old", version: 1 }),
        create: jest.fn().mockResolvedValue({
          id: "L2",
          personId: "p1",
          letterType: "RECOMENDACAO",
          status: "DRAFT",
          title: "Carta",
          bodyText: "Texto",
          version: 2,
          supersedesId: "old",
          issuedAt: null,
          revokedAt: null,
          createdAt: now,
        }),
      },
      auditLog: { create: jest.fn() },
    };
    const service = new LettersService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      service.create(secretaria, {
        personId: "p1",
        letterType: "RECOMENDACAO",
        title: "Carta",
        bodyText: "Texto",
      }),
    ).resolves.toMatchObject({ id: "L2", version: 2, status: "DRAFT" });
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });

  it("creates first version when no previous letter", async () => {
    const prisma = {
      person: { findFirst: jest.fn().mockResolvedValue({ id: "p1" }) },
      churchLetter: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(draftLetter),
      },
      auditLog: { create: jest.fn() },
    };
    const service = new LettersService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const result = await service.create(secretaria, {
      personId: "p1",
      letterType: "MEMBRESIA",
      title: "  Carta  ",
      bodyText: "  Texto  ",
    });
    expect(result.version).toBe(1);
    expect(prisma.churchLetter.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          version: 1,
          supersedesId: null,
          letterType: "MEMBRESIA",
        }),
      }),
    );
  });

  it("rejects create validation errors", async () => {
    const prisma = {
      person: { findFirst: jest.fn() },
      churchLetter: { findFirst: jest.fn(), create: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const service = new LettersService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    await expect(
      service.create(secretaria, {
        personId: "p1",
        letterType: "INVALID",
        title: "t",
        bodyText: "b",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.create(secretaria, {
        personId: "p1",
        letterType: "OUTRO",
        title: " ",
        bodyText: "b",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.person.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.create(secretaria, {
        personId: "missing",
        letterType: "TRANSFERENCIA",
        title: "t",
        bodyText: "b",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("issues draft letter", async () => {
    const issued = {
      ...draftLetter,
      status: "ISSUED",
      issuedAt: now,
    };
    const prisma = {
      churchLetter: {
        findFirst: jest.fn().mockResolvedValue(draftLetter),
        update: jest.fn().mockResolvedValue(issued),
      },
      auditLog: { create: jest.fn() },
    };
    const service = new LettersService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const result = await service.issue(secretaria, "L1");
    expect(result.status).toBe("ISSUED");
    expect(result.issuedAt).toBe(now.toISOString());
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "letter.issue" }),
      }),
    );
  });

  it("rejects issue when missing or not draft", async () => {
    const prisma = {
      churchLetter: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ ...draftLetter, status: "ISSUED" }),
        update: jest.fn(),
      },
      auditLog: { create: jest.fn() },
    };
    const service = new LettersService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    await expect(service.issue(secretaria, "missing")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.issue(secretaria, "L1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("revokes issued letter", async () => {
    const issued = { ...draftLetter, status: "ISSUED", issuedAt: now };
    const revoked = {
      ...issued,
      status: "REVOKED",
      revokedAt: now,
    };
    const prisma = {
      churchLetter: {
        findFirst: jest.fn().mockResolvedValue(issued),
        update: jest.fn().mockResolvedValue(revoked),
      },
      auditLog: { create: jest.fn() },
    };
    const service = new LettersService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const result = await service.revoke(secretaria, "L1");
    expect(result.status).toBe("REVOKED");
    expect(result.revokedAt).toBe(now.toISOString());
  });

  it("rejects revoke when missing or not issued", async () => {
    const prisma = {
      churchLetter: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(draftLetter),
        update: jest.fn(),
      },
      auditLog: { create: jest.fn() },
    };
    const service = new LettersService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    await expect(service.revoke(secretaria, "missing")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.revoke(secretaria, "L1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
