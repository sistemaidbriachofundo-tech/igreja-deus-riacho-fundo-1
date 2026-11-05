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

  const draft = {
    id: "L2",
    personId: "p1",
    letterType: "RECOMENDACAO",
    status: "DRAFT",
    title: "Carta",
    bodyText: "Texto",
    version: 2,
    supersedesId: "old",
    issuedAt: null as Date | null,
    revokedAt: null as Date | null,
    createdAt: new Date("2026-11-05T00:00:00Z"),
  };

  it("forbids pastor from issuing letters", async () => {
    const service = new LettersService(
      {} as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(service.list(pastor)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("lists letters", async () => {
    const prisma = {
      churchLetter: { findMany: jest.fn().mockResolvedValue([draft]) },
    };
    const service = new LettersService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(service.list(secretaria, "p1")).resolves.toMatchObject({
      letters: [{ id: "L2", version: 2 }],
    });
  });

  it("creates versioned draft letter", async () => {
    const prisma = {
      person: { findFirst: jest.fn().mockResolvedValue({ id: "p1" }) },
      churchLetter: {
        findFirst: jest.fn().mockResolvedValue({ id: "old", version: 1 }),
        create: jest.fn().mockResolvedValue(draft),
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
  });

  it("validates create input", async () => {
    const service = new LettersService(
      {
        person: { findFirst: jest.fn().mockResolvedValue(null) },
        churchLetter: { findFirst: jest.fn() },
      } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      service.create(secretaria, {
        personId: "p1",
        letterType: "NOPE",
        title: "Carta",
        bodyText: "Texto",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create(secretaria, {
        personId: "p1",
        letterType: "MEMBRESIA",
        title: " ",
        bodyText: "Texto",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create(secretaria, {
        personId: "missing",
        letterType: "MEMBRESIA",
        title: "Carta",
        bodyText: "Texto",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("issues and revokes letters", async () => {
    const issued = {
      ...draft,
      status: "ISSUED",
      issuedAt: new Date("2026-11-05T01:00:00Z"),
    };
    const revoked = {
      ...issued,
      status: "REVOKED",
      revokedAt: new Date("2026-11-05T02:00:00Z"),
    };
    const prisma = {
      churchLetter: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(draft)
          .mockResolvedValueOnce(issued)
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(draft),
        update: jest
          .fn()
          .mockResolvedValueOnce(issued)
          .mockResolvedValueOnce(revoked),
      },
      auditLog: { create: jest.fn() },
    };
    const service = new LettersService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    await expect(service.issue(secretaria, "L2")).resolves.toMatchObject({
      status: "ISSUED",
    });
    await expect(service.revoke(secretaria, "L2")).resolves.toMatchObject({
      status: "REVOKED",
    });
    await expect(service.issue(secretaria, "x")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.revoke(secretaria, "L2")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
