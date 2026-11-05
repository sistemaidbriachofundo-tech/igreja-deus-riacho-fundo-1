import { ForbiddenException } from "@nestjs/common";
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

  it("forbids pastor from issuing letters", async () => {
    const service = new LettersService(
      {} as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(service.list(pastor)).rejects.toBeInstanceOf(ForbiddenException);
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
          createdAt: new Date("2026-11-05T00:00:00Z"),
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
  });
});
