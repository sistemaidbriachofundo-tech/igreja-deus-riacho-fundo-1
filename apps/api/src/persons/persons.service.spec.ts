import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { PersonsService } from "./persons.service";
import type { AuthUser } from "../auth/types/auth-user";

describe("PersonsService", () => {
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

  function build(prismaOverrides: Record<string, unknown> = {}) {
    const prisma = {
      person: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        ...((prismaOverrides.person as object) ?? {}),
      },
      ...prismaOverrides,
    };
    const service = new PersonsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    return { service, prisma };
  }

  it("forbids search without membership role", async () => {
    const { service } = build();
    await expect(service.search(memberOnly, "ana")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("returns empty hits for short query", async () => {
    const { service, prisma } = build();
    const result = await service.search(secretaria, "a");
    expect(result.hits).toEqual([]);
    expect(result.autoMergeForbidden).toBe(true);
    expect(prisma.person.findMany).not.toHaveBeenCalled();
  });

  it("scores exact and partial name/email matches", async () => {
    const { service, prisma } = build({
      person: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "p1",
            displayName: "Ana Demo",
            email: "ana.demo@example.test",
            status: "ACTIVE",
            householdId: null,
            kind: "MEMBER",
            isMinor: false,
          },
          {
            id: "p2",
            displayName: "Bruno Demo",
            email: "other@example.test",
            status: "ACTIVE",
            householdId: "h1",
            kind: "MEMBER",
            isMinor: false,
          },
        ]),
        findFirst: jest.fn(),
      },
    });

    const exact = await service.search(secretaria, "Ana Demo", 100);
    expect(exact.hits[0]?.score).toBe(0.95);
    expect(exact.hits[0]?.matchReasons).toEqual(
      expect.arrayContaining(["displayName"]),
    );

    const partial = await service.search(secretaria, "demo", 5);
    expect(prisma.person.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5 }),
    );
    expect(partial.hits.some((h) => h.score === 0.7 || h.score === 0.85)).toBe(
      true,
    );
  });

  it("getById returns person or 404", async () => {
    const { service, prisma } = build({
      person: {
        findMany: jest.fn(),
        findFirst: jest.fn().mockResolvedValueOnce({
          id: "p1",
          displayName: "Ana",
          email: null,
          status: "ACTIVE",
          householdId: null,
          kind: "MEMBER",
          isMinor: false,
          legalGuardianPersonId: null,
        }),
      },
    });
    await expect(service.getById(secretaria, "p1")).resolves.toMatchObject({
      id: "p1",
    });

    prisma.person.findFirst.mockResolvedValueOnce(null);
    await expect(service.getById(secretaria, "missing")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("forbids getById for membro", async () => {
    const { service } = build();
    await expect(service.getById(memberOnly, "p1")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
