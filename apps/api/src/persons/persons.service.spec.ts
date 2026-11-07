import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
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
        update: jest.fn(),
        ...((prismaOverrides.person as object) ?? {}),
      },
      household: { findFirst: jest.fn() },
      auditLog: { create: jest.fn() },
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
            photoStorageKey: null,
          },
          {
            id: "p2",
            displayName: "Bruno Demo",
            email: "other@example.test",
            status: "ACTIVE",
            householdId: "h1",
            kind: "MEMBER",
            isMinor: false,
            photoStorageKey: null,
          },
        ]),
        findFirst: jest.fn(),
      },
    });

    const exact = await service.search(secretaria, "Ana Demo", 100);
    expect(exact.hits[0]?.score).toBeGreaterThanOrEqual(0.95);
    expect(exact.hits[0]?.person).toMatchObject({
      kind: "MEMBER",
      isMinor: false,
      photo: { status: "NONE", hasStorageKey: false },
    });

    const partial = await service.search(secretaria, "demo", 5);
    expect(prisma.person.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: expect.any(Number) }),
    );
    expect(partial.hits.some((h) => h.score >= 0.7)).toBe(true);
  });

  it("findCandidates ranks exact email as strongMatch without merge", async () => {
    const { service } = build({
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
            photoStorageKey: "persons/org/p1/photo/x.jpg",
          },
        ]),
        findFirst: jest.fn(),
      },
    });

    const result = await service.findCandidates(secretaria, {
      displayName: "Outra Pessoa",
      email: "ana.demo@example.test",
    });
    expect(result.autoMergeForbidden).toBe(true);
    expect(result.strongMatch).toBe(true);
    expect(result.hits[0]?.matchReasons).toEqual(
      expect.arrayContaining(["exactEmail"]),
    );
    expect(result.hits[0]?.person.photo).toEqual({
      status: "READY",
      hasStorageKey: true,
    });
  });

  it("findCandidates forbids member-only and validates input", async () => {
    const { service } = build();
    await expect(
      service.findCandidates(memberOnly, { displayName: "Ana" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.findCandidates(secretaria, { displayName: " " }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("getById returns person or 404; membro only self", async () => {
    const { service, prisma } = build({
      person: {
        findMany: jest.fn(),
        findFirst: jest.fn().mockResolvedValue({
          id: "p-mem",
          displayName: "Bruno",
          email: null,
          status: "ACTIVE",
          householdId: null,
          kind: "MEMBER",
          isMinor: false,
          legalGuardianPersonId: null,
          photoStorageKey: null,
        }),
      },
    });
    await expect(service.getById(memberOnly, "p-mem")).resolves.toMatchObject({
      id: "p-mem",
      photo: { status: "NONE" },
    });
    await expect(service.getById(memberOnly, "other")).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    prisma.person.findFirst.mockResolvedValueOnce(null);
    await expect(service.getById(secretaria, "missing")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("dossier returns history for staff", async () => {
    const { service } = build({
      person: {
        findMany: jest.fn(),
        findFirst: jest.fn().mockResolvedValue({
          id: "p1",
          displayName: "Carla",
          email: "c@example.test",
          status: "ACTIVE",
          kind: "VISITOR",
          isMinor: false,
          householdId: null,
          legalGuardianPersonId: null,
          photoStorageKey: null,
          legalGuardian: null,
          dependents: [],
          household: null,
          memberships: [
            {
              id: "m1",
              status: "PENDING_ADMISSION",
              joinedAt: new Date("2026-11-04T12:00:00Z"),
              notes: "n",
            },
          ],
          admissions: [
            {
              id: "a1",
              status: "DRAFT",
              modality: null,
              currentStep: "modality",
              createdAt: new Date(),
              updatedAt: new Date(),
              modalityRecorded: false,
              documentsComplete: false,
              secretariaApproved: false,
              pastorApproved: false,
            },
          ],
        }),
      },
    });
    const dossier = await service.getDossier(secretaria, "p1");
    expect(dossier.admissionHistory).toHaveLength(1);
    expect(dossier.memberships[0]?.notes).toBe("n");
    expect(dossier.person.photo).toEqual({
      status: "NONE",
      hasStorageKey: false,
    });
  });

  it("patch requires guardian for minor", async () => {
    const { service, prisma } = build({
      person: {
        findMany: jest.fn(),
        findFirst: jest.fn().mockResolvedValue({
          id: "kid",
          isMinor: false,
          legalGuardianPersonId: null,
          organizationId: "org1",
        }),
        update: jest.fn(),
      },
    });
    await expect(
      service.patch(secretaria, "kid", { isMinor: true }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.person.findFirst
      .mockResolvedValueOnce({
        id: "kid",
        isMinor: false,
        legalGuardianPersonId: null,
        organizationId: "org1",
      })
      .mockResolvedValueOnce({
        id: "adult",
        isMinor: false,
      });
    prisma.person.update.mockResolvedValue({
      id: "kid",
      displayName: "Kid",
      email: null,
      status: "ACTIVE",
      householdId: null,
      kind: "VISITOR",
      isMinor: true,
      legalGuardianPersonId: "adult",
      photoStorageKey: null,
    });
    await expect(
      service.patch(secretaria, "kid", {
        isMinor: true,
        legalGuardianPersonId: "adult",
      }),
    ).resolves.toMatchObject({ isMinor: true });
  });
});
