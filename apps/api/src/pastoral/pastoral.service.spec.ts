import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { PastoralService } from "./pastoral.service";
import type { AuthUser } from "../auth/types/auth-user";

describe("PastoralService", () => {
  const pilot = {
    organizationId: "org1",
    churchId: "church-rf1",
    organizationSlug: "igreja-de-deus",
    churchSlug: "riacho-fundo-1",
    churchName: "Riacho Fundo I (demo)",
  };

  const pastor: AuthUser = {
    userId: "u-pastor",
    personId: "p-pastor",
    email: "pastor.demo@example.test",
    grants: [
      {
        roleCode: "PASTOR",
        organizationId: "org1",
        churchId: "church-rf1",
      },
    ],
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

  const now = new Date("2026-11-05T12:00:00Z");

  const caseRow = {
    id: "pc1",
    organizationId: pilot.organizationId,
    churchId: pilot.churchId,
    personId: "p1",
    kind: "VISITA",
    status: "OPEN",
    title: "Visita",
    summary: "resumo",
    assignedToUserId: null as string | null,
    createdByUserId: pastor.userId,
    dueAt: now,
    closedAt: null as Date | null,
    createdAt: now,
    updatedAt: now,
    tasks: [
      {
        id: "task1",
        caseId: "pc1",
        title: "Ligar",
        done: false,
        dueAt: now,
        createdAt: now,
        updatedAt: now,
      },
    ],
  };

  function withTx(tx: object) {
    return {
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    };
  }

  it("forbids SECRETARIA from creating pastoral cases", async () => {
    const service = new PastoralService(
      { $transaction: jest.fn() } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      service.create(secretaria, {
        personId: "p1",
        kind: "VISITA",
        title: "Visita",
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("forbids PLATFORM_ADMIN from pastoral care by default", async () => {
    const admin: AuthUser = {
      userId: "u-admin",
      personId: "p-admin",
      email: "admin@example.test",
      grants: [
        {
          roleCode: "PLATFORM_ADMIN",
          organizationId: "org1",
          churchId: "church-rf1",
        },
      ],
    };
    const service = new PastoralService(
      { $transaction: jest.fn() } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(service.list(admin)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("creates pastoral case for pastor and audits", async () => {
    const tx = {
      pastoralCase: {
        create: jest.fn().mockResolvedValue({ ...caseRow, tasks: [] }),
      },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      person: {
        findFirst: jest.fn().mockResolvedValue({ id: "p1" }),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: "u-assignee" }),
      },
      ...withTx(tx),
    };
    const service = new PastoralService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    const result = await service.create(pastor, {
      personId: "p1",
      kind: "VISITA",
      title: " Visita ",
      summary: "  nota  ",
      assignedToUserId: "u-assignee",
      dueAt: "2026-11-10T10:00:00Z",
    });
    expect(result.id).toBe("pc1");
    expect(result.title).toBe("Visita");
    expect(tx.auditLog.create).toHaveBeenCalled();
    expect(prisma.user.findFirst).toHaveBeenCalled();
  });

  it("rejects create with invalid kind, empty title/personId, missing person, bad dueAt, missing assignee", async () => {
    const prisma = {
      person: { findFirst: jest.fn() },
      user: { findFirst: jest.fn() },
      $transaction: jest.fn(),
    };
    const service = new PastoralService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    await expect(
      service.create(pastor, { personId: "p1", kind: "X", title: "t" }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.create(pastor, { personId: "p1", kind: "VISITA", title: "  " }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.create(pastor, { personId: "  ", kind: "VISITA", title: "t" }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.person.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.create(pastor, { personId: "p-missing", kind: "VISITA", title: "t" }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.person.findFirst.mockResolvedValueOnce({ id: "p1" });
    prisma.user.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.create(pastor, {
        personId: "p1",
        kind: "ORACAO",
        title: "t",
        assignedToUserId: "u-missing",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.person.findFirst.mockResolvedValueOnce({ id: "p1" });
    await expect(
      service.create(pastor, {
        personId: "p1",
        kind: "ACOLHIMENTO",
        title: "t",
        dueAt: "not-a-date",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("lists cases for pastor", async () => {
    const prisma = {
      pastoralCase: {
        findMany: jest.fn().mockResolvedValue([caseRow]),
      },
    };
    const service = new PastoralService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const result = await service.list(pastor);
    expect(result.churchId).toBe(pilot.churchId);
    expect(result.cases).toHaveLength(1);
    expect(result.cases[0].tasks[0].id).toBe("task1");
    expect(result.cases[0].dueAt).toBe(now.toISOString());
  });

  it("forbids SECRETARIA from listing cases", async () => {
    const service = new PastoralService(
      { pastoralCase: { findMany: jest.fn() } } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(service.list(secretaria)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("gets case by id and 404s when missing", async () => {
    const prisma = {
      pastoralCase: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(caseRow)
          .mockResolvedValueOnce(null),
      },
    };
    const service = new PastoralService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(service.getById(pastor, "pc1")).resolves.toMatchObject({
      id: "pc1",
      closedAt: null,
    });
    await expect(service.getById(pastor, "missing")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("updates status to DONE (sets closedAt) and rejects invalid status", async () => {
    const closed = new Date("2026-11-06T12:00:00Z");
    const tx = {
      pastoralCase: {
        update: jest.fn().mockResolvedValue({
          ...caseRow,
          status: "DONE",
          closedAt: closed,
          dueAt: null,
          tasks: [],
        }),
      },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      pastoralCase: { findFirst: jest.fn().mockResolvedValue(caseRow) },
      ...withTx(tx),
    };
    const service = new PastoralService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    const done = await service.updateStatus(pastor, "pc1", "DONE");
    expect(done.status).toBe("DONE");
    expect(done.closedAt).toBe(closed.toISOString());
    expect(done.dueAt).toBeNull();
    expect(tx.auditLog.create).toHaveBeenCalled();

    await expect(
      service.updateStatus(pastor, "pc1", "NOPE"),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("updates status to IN_PROGRESS without closedAt", async () => {
    const tx = {
      pastoralCase: {
        update: jest.fn().mockImplementation(async ({ data }) => {
          expect(data.closedAt).toBeNull();
          return { ...caseRow, status: data.status, closedAt: null, tasks: [] };
        }),
      },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      pastoralCase: { findFirst: jest.fn().mockResolvedValue(caseRow) },
      ...withTx(tx),
    };
    const service = new PastoralService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const result = await service.updateStatus(pastor, "pc1", "IN_PROGRESS");
    expect(result.status).toBe("IN_PROGRESS");
  });

  it("assigns case and validates assignee", async () => {
    const tx = {
      pastoralCase: {
        update: jest.fn().mockResolvedValue({
          ...caseRow,
          assignedToUserId: "u2",
          tasks: [],
        }),
      },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      pastoralCase: { findFirst: jest.fn().mockResolvedValue(caseRow) },
      user: { findFirst: jest.fn().mockResolvedValue({ id: "u2" }) },
      ...withTx(tx),
    };
    const service = new PastoralService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    await expect(service.assign(pastor, "pc1", "  ")).rejects.toBeInstanceOf(
      BadRequestException,
    );

    const result = await service.assign(pastor, "pc1", "u2");
    expect(result.assignedToUserId).toBe("u2");
  });

  it("adds task with validation", async () => {
    const tx = {
      pastoralTask: {
        create: jest.fn().mockResolvedValue({
          id: "task2",
          caseId: "pc1",
          title: "Orar",
          done: false,
          dueAt: null,
          createdAt: now,
          updatedAt: now,
        }),
      },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      pastoralCase: { findFirst: jest.fn().mockResolvedValue(caseRow) },
      ...withTx(tx),
    };
    const service = new PastoralService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    await expect(
      service.addTask(pastor, "pc1", { title: " " }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.addTask(pastor, "pc1", { title: "t", dueAt: "bad" }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const result = await service.addTask(pastor, "pc1", {
      title: " Orar ",
      dueAt: "2026-11-12T08:00:00Z",
    });
    expect(result.id).toBe("task2");
    expect(tx.auditLog.create).toHaveBeenCalled();
  });

  it("updates task done and 404s missing task", async () => {
    const tx = {
      pastoralTask: {
        update: jest.fn().mockResolvedValue({
          id: "task1",
          caseId: "pc1",
          title: "Ligar",
          done: true,
          dueAt: null,
          createdAt: now,
          updatedAt: now,
        }),
      },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      pastoralCase: { findFirst: jest.fn().mockResolvedValue(caseRow) },
      pastoralTask: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(caseRow.tasks[0]),
      },
      ...withTx(tx),
    };
    const service = new PastoralService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );

    await expect(
      service.updateTaskDone(pastor, "pc1", "missing", true),
    ).rejects.toBeInstanceOf(NotFoundException);

    const result = await service.updateTaskDone(pastor, "pc1", "task1", true);
    expect(result.done).toBe(true);
    expect(result.dueAt).toBeNull();
  });

  it("RF-009 forbids SECRETARIA from pastoral export", async () => {
    const service = new PastoralService(
      {} as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(service.exportCases(secretaria)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("RF-009 exports cases and audits without summary in metadata", async () => {
    const prisma = {
      pastoralCase: {
        findMany: jest.fn().mockResolvedValue([caseRow]),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new PastoralService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const res = await service.exportCases(pastor, { status: "OPEN" });
    expect(res.count).toBe(1);
    expect(res.cases[0].id).toBe("pc1");
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "pastoral.export",
          metadata: expect.objectContaining({
            count: 1,
            caseIds: ["pc1"],
            purpose: "pastoral_care_export",
          }),
        }),
      }),
    );
    const meta = (prisma.auditLog.create as jest.Mock).mock.calls[0][0].data
      .metadata as Record<string, unknown>;
    expect(meta).not.toHaveProperty("summary");
    expect(JSON.stringify(meta)).not.toContain("resumo");
  });

  it("RF-009 upserts retention policy", async () => {
    const policy = {
      id: "pol1",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      closedCaseRetentionDays: 365,
      redactionEnabled: true,
      updatedByUserId: pastor.userId,
      createdAt: now,
      updatedAt: now,
    };
    const tx = {
      pastoralRetentionPolicy: {
        upsert: jest.fn().mockResolvedValue(policy),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new PastoralService(
      withTx(tx) as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const dto = await service.upsertRetentionPolicy(pastor, {
      closedCaseRetentionDays: 365,
    });
    expect(dto.closedCaseRetentionDays).toBe(365);
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "pastoral.retention.policy.upsert",
        }),
      }),
    );
  });

  it("RF-009 applyRetention redacts closed summaries past cutoff", async () => {
    const policy = {
      id: "pol1",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      closedCaseRetentionDays: 30,
      redactionEnabled: true,
      updatedByUserId: null,
      createdAt: now,
      updatedAt: now,
    };
    const tx = {
      pastoralCase: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      ...withTx(tx),
      pastoralRetentionPolicy: {
        findUnique: jest.fn().mockResolvedValue(policy),
      },
      pastoralCase: {
        findMany: jest.fn().mockResolvedValue([{ id: "pc-old" }]),
      },
    };
    const service = new PastoralService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const res = await service.applyRetention(pastor);
    expect(res.redactedCount).toBe(1);
    expect(tx.pastoralCase.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { summary: null },
      }),
    );
  });

  it("RF-009 getRetentionPolicy creates default when missing", async () => {
    const created = {
      id: "pol-new",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      closedCaseRetentionDays: 2555,
      redactionEnabled: true,
      updatedByUserId: null,
      createdAt: now,
      updatedAt: now,
    };
    const prisma = {
      pastoralRetentionPolicy: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(created),
      },
    };
    const service = new PastoralService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const dto = await service.getRetentionPolicy(pastor);
    expect(dto.closedCaseRetentionDays).toBe(2555);
    expect(prisma.pastoralRetentionPolicy.create).toHaveBeenCalled();
  });

  it("RF-009 rejects invalid retention days and export range/date", async () => {
    const prisma = {
      pastoralCase: { findMany: jest.fn().mockResolvedValue([]) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new PastoralService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      service.upsertRetentionPolicy(pastor, { closedCaseRetentionDays: 10 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.exportCases(pastor, {
        from: "2026-12-01T00:00:00Z",
        to: "2026-11-01T00:00:00Z",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.exportCases(pastor, { from: "not-a-date" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("RF-009 export with date window and applyRetention when redaction disabled", async () => {
    const prisma = {
      pastoralCase: { findMany: jest.fn().mockResolvedValue([caseRow]) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      pastoralRetentionPolicy: {
        findUnique: jest.fn().mockResolvedValue({
          id: "pol1",
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          closedCaseRetentionDays: 365,
          redactionEnabled: false,
          updatedByUserId: null,
          createdAt: now,
          updatedAt: now,
        }),
      },
    };
    const service = new PastoralService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const exported = await service.exportCases(pastor, {
      personId: "p1",
      from: "2026-11-01T00:00:00Z",
      to: "2026-11-30T00:00:00Z",
    });
    expect(exported.count).toBe(1);
    expect(prisma.pastoralCase.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          personId: "p1",
          createdAt: expect.any(Object),
        }),
      }),
    );
    const skipped = await service.applyRetention(pastor);
    expect(skipped.redactionEnabled).toBe(false);
    expect(skipped.redactedCount).toBe(0);
  });
});
