import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { AssetsService } from "./assets.service";
import type { AuthUser } from "../auth/types/auth-user";

describe("AssetsService", () => {
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
    email: "sec@example.test",
    grants: [
      {
        roleCode: "SECRETARIA",
        organizationId: "org1",
        churchId: "church-rf1",
      },
    ],
  };

  const membro: AuthUser = {
    userId: "u-m",
    personId: "p-m",
    email: "m@example.test",
    grants: [
      {
        roleCode: "MEMBRO",
        organizationId: "org1",
        churchId: "church-rf1",
      },
    ],
  };

  const now = new Date("2026-11-07T12:00:00Z");

  function withTx(tx: object) {
    return {
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    };
  }

  it("forbids MEMBRO from listing assets", async () => {
    const prisma = {
      church: {
        findFirst: jest.fn().mockResolvedValue({
          id: pilot.churchId,
          organizationId: pilot.organizationId,
        }),
      },
    };
    const service = new AssetsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(service.list(membro)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("creates asset with CREATED history and audit", async () => {
    const asset = {
      id: "a1",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      code: "PAT-1",
      name: "Projetor",
      description: null as string | null,
      location: "Sala 1",
      responsiblePersonId: null as string | null,
      status: "ACTIVE",
      acquiredAt: null as Date | null,
      createdAt: now,
      updatedAt: now,
    };
    const tx = {
      churchAsset: { create: jest.fn().mockResolvedValue(asset) },
      churchAssetHistory: { create: jest.fn().mockResolvedValue({}) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      ...withTx(tx),
      church: {
        findFirst: jest.fn().mockResolvedValue({
          id: pilot.churchId,
          organizationId: pilot.organizationId,
        }),
      },
    };
    const service = new AssetsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const dto = await service.create(secretaria, {
      name: "Projetor",
      code: "PAT-1",
      location: "Sala 1",
    });
    expect(dto).toMatchObject({ id: "a1", location: "Sala 1", status: "ACTIVE" });
    expect(tx.churchAssetHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ kind: "CREATED" }),
      }),
    );
  });

  it("blocks churchId outside actor grants", async () => {
    const prisma = {
      church: { findFirst: jest.fn() },
    };
    const service = new AssetsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      service.list(secretaria, { churchId: "church-rf2" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.church.findFirst).not.toHaveBeenCalled();
  });

  it("updates status and records STATUS_CHANGE history", async () => {
    const current = {
      id: "a1",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      code: null,
      name: "Projetor",
      description: null,
      location: "Sala 1",
      responsiblePersonId: null,
      status: "ACTIVE",
      acquiredAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const updated = { ...current, status: "MAINTENANCE", updatedAt: now };
    const tx = {
      churchAsset: { update: jest.fn().mockResolvedValue(updated) },
      churchAssetHistory: { create: jest.fn().mockResolvedValue({}) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      ...withTx(tx),
      churchAsset: { findFirst: jest.fn().mockResolvedValue(current) },
    };
    const service = new AssetsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const dto = await service.update(secretaria, "a1", {
      status: "MAINTENANCE",
    });
    expect(dto.status).toBe("MAINTENANCE");
    expect(tx.churchAssetHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: "STATUS_CHANGE",
          fromStatus: "ACTIVE",
          toStatus: "MAINTENANCE",
        }),
      }),
    );
  });

  it("adds note to history", async () => {
    const current = {
      id: "a1",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      code: null,
      name: "Projetor",
      description: null,
      location: null,
      responsiblePersonId: null,
      status: "ACTIVE",
      acquiredAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const event = {
      id: "h1",
      assetId: "a1",
      kind: "NOTE",
      note: "Troca de lâmpada",
      fromStatus: null,
      toStatus: null,
      fromLocation: null,
      toLocation: null,
      fromResponsiblePersonId: null,
      toResponsiblePersonId: null,
      actorUserId: secretaria.userId,
      recordedAt: now,
      createdAt: now,
    };
    const tx = {
      churchAssetHistory: { create: jest.fn().mockResolvedValue(event) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      ...withTx(tx),
      churchAsset: { findFirst: jest.fn().mockResolvedValue(current) },
    };
    const service = new AssetsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const dto = await service.addNote(secretaria, "a1", "Troca de lâmpada");
    expect(dto.kind).toBe("NOTE");
  });

  it("rejects empty note", async () => {
    const prisma = {
      churchAsset: {
        findFirst: jest.fn().mockResolvedValue({
          id: "a1",
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
        }),
      },
    };
    const service = new AssetsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(service.addNote(secretaria, "a1", "  ")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("404 when asset missing", async () => {
    const prisma = {
      churchAsset: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new AssetsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(service.getById(secretaria, "x")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("rejects empty asset name and invalid status on create", async () => {
    const prisma = {
      church: {
        findFirst: jest.fn().mockResolvedValue({
          id: pilot.churchId,
          organizationId: pilot.organizationId,
        }),
      },
    };
    const service = new AssetsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      service.create(secretaria, { name: "  " }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create(secretaria, { name: "X", status: "BROKEN" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("lists and gets assets; 404 church missing", async () => {
    const asset = {
      id: "a1",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      code: null,
      name: "Projetor",
      description: null,
      location: "Sala 1",
      responsiblePersonId: null,
      status: "ACTIVE",
      acquiredAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const prisma = {
      church: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({
            id: pilot.churchId,
            organizationId: pilot.organizationId,
          })
          .mockResolvedValueOnce(null),
      },
      churchAsset: {
        findMany: jest.fn().mockResolvedValue([asset]),
        findFirst: jest.fn().mockResolvedValue(asset),
      },
    };
    const service = new AssetsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const listed = await service.list(secretaria, { status: "ACTIVE" });
    expect(listed.assets).toHaveLength(1);
    const got = await service.getById(secretaria, "a1");
    expect(got.id).toBe("a1");
    await expect(service.list(secretaria)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("updates location, responsible, name and records history kinds", async () => {
    const current = {
      id: "a1",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      code: null,
      name: "Projetor",
      description: "old",
      location: "Sala 1",
      responsiblePersonId: null as string | null,
      status: "ACTIVE",
      acquiredAt: null as Date | null,
      createdAt: now,
      updatedAt: now,
    };
    const updated = {
      ...current,
      name: "Projetor HD",
      description: "novo",
      location: "Sala 2",
      responsiblePersonId: "p1",
      acquiredAt: now,
    };
    const tx = {
      churchAsset: { update: jest.fn().mockResolvedValue(updated) },
      churchAssetHistory: { create: jest.fn().mockResolvedValue({}) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      ...withTx(tx),
      churchAsset: { findFirst: jest.fn().mockResolvedValue(current) },
      person: { findFirst: jest.fn().mockResolvedValue({ id: "p1" }) },
    };
    const service = new AssetsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      service.update(secretaria, "a1", { name: "  " }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.update(secretaria, "a1", { note: "x".repeat(300) }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.update(secretaria, "a1", { acquiredAt: "bad-date" }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const dto = await service.update(secretaria, "a1", {
      name: "Projetor HD",
      description: "novo",
      location: "Sala 2",
      responsiblePersonId: "p1",
      acquiredAt: now.toISOString(),
      note: "realocação",
    });
    expect(dto.location).toBe("Sala 2");
    const kinds = (tx.churchAssetHistory.create as jest.Mock).mock.calls.map(
      (c) => c[0].data.kind,
    );
    expect(kinds).toEqual(
      expect.arrayContaining([
        "LOCATION_CHANGE",
        "RESPONSIBLE_CHANGE",
        "UPDATED",
      ]),
    );
  });

  it("update with note-only attaches NOTE history; clears acquiredAt", async () => {
    const current = {
      id: "a1",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      code: null,
      name: "Projetor",
      description: null,
      location: "Sala 1",
      responsiblePersonId: null,
      status: "ACTIVE",
      acquiredAt: now,
      createdAt: now,
      updatedAt: now,
    };
    const updated = { ...current, acquiredAt: null };
    const tx = {
      churchAsset: { update: jest.fn().mockResolvedValue(updated) },
      churchAssetHistory: { create: jest.fn().mockResolvedValue({}) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      ...withTx(tx),
      churchAsset: { findFirst: jest.fn().mockResolvedValue(current) },
    };
    const service = new AssetsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await service.update(secretaria, "a1", { note: "só nota" });
    expect(tx.churchAssetHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ kind: "NOTE", note: "só nota" }),
      }),
    );
    await service.update(secretaria, "a1", { acquiredAt: null });
    expect(tx.churchAsset.update).toHaveBeenCalled();
  });

  it("lists history; forbids asset outside grant; rejects missing person", async () => {
    const current = {
      id: "a1",
      organizationId: pilot.organizationId,
      churchId: "church-rf2",
      code: null,
      name: "X",
      description: null,
      location: null,
      responsiblePersonId: null,
      status: "ACTIVE",
      acquiredAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const event = {
      id: "h1",
      assetId: "a1",
      kind: "CREATED",
      note: null,
      fromStatus: null,
      toStatus: "ACTIVE",
      fromLocation: null,
      toLocation: null,
      fromResponsiblePersonId: null,
      toResponsiblePersonId: null,
      actorUserId: secretaria.userId,
      recordedAt: now,
      createdAt: now,
    };
    const inScope = { ...current, churchId: pilot.churchId };
    const prisma = {
      churchAsset: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(current)
          .mockResolvedValue(inScope),
      },
      churchAssetHistory: { findMany: jest.fn().mockResolvedValue([event]) },
      person: { findFirst: jest.fn().mockResolvedValue(null) },
      church: {
        findFirst: jest.fn().mockResolvedValue({
          id: pilot.churchId,
          organizationId: pilot.organizationId,
        }),
      },
    };
    const service = new AssetsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(service.getById(secretaria, "a1")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    const hist = await service.listHistory(secretaria, "a1");
    expect(hist.history).toHaveLength(1);
    await expect(
      service.create(secretaria, {
        name: "Y",
        responsiblePersonId: "missing",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
