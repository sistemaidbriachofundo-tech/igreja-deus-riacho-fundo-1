import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { AuditService } from "./audit.service";
import type { AuthUser } from "../auth/types/auth-user";

describe("AuditService", () => {
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
    organizationId: "org1",
    churchId: "church-rf1",
    grants: [
      {
        roleCode: "SECRETARIA",
        organizationId: "org1",
        churchId: "church-rf1",
      },
    ],
  };

  const member: AuthUser = {
    userId: "u-mem",
    personId: "p-mem",
    email: "bruno.demo@example.test",
    organizationId: "org1",
    churchId: "church-rf1",
    grants: [
      {
        roleCode: "MEMBRO",
        organizationId: "org1",
        churchId: "church-rf1",
      },
    ],
  };

  const platformAdmin: AuthUser = {
    userId: "u-plat",
    personId: "p-plat",
    email: "platform.demo@example.test",
    organizationId: "org1",
    churchId: "church-rf1",
    grants: [
      {
        roleCode: "PLATFORM_ADMIN",
        organizationId: "org1",
        churchId: null,
      },
    ],
  };

  const sampleRow = {
    id: "l1",
    action: "admission.create",
    resourceType: "admission_protocol",
    resourceId: "a1",
    actorUserId: "u-sec",
    metadata: { ok: true },
    createdAt: new Date("2026-11-04T12:00:00Z"),
    churchId: "church-rf1",
  };

  it("lists recent logs for secretaria (church default RF1)", async () => {
    const prisma = {
      auditLog: {
        findMany: jest.fn().mockResolvedValue([sampleRow]),
      },
    };
    const service = new AuditService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const result = await service.listRecent(secretaria, 10);
    expect(result.logs).toHaveLength(1);
    expect(result.logs[0]?.metadata).toEqual({ ok: true });
    expect(result.scope).toBe("church");
    expect(result.churchId).toBe("church-rf1");
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 11,
        where: expect.objectContaining({
          organizationId: "org1",
          churchId: "church-rf1",
        }),
      }),
    );
  });

  it("PLATFORM_ADMIN cross-church with scope=organization", async () => {
    const prisma = {
      auditLog: {
        findMany: jest.fn().mockResolvedValue([
          sampleRow,
          { ...sampleRow, id: "l2", churchId: "church-rf2" },
        ]),
      },
    };
    const service = new AuditService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const result = await service.listRecent(platformAdmin, 50, {
      scope: "organization",
    });
    expect(result.scope).toBe("organization");
    expect(result.churchId).toBeNull();
    expect(result.logs).toHaveLength(2);
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: "org1" },
      }),
    );
  });

  it("forbids secretaria from org-wide scope", async () => {
    const service = new AuditService(
      { auditLog: { findMany: jest.fn() } } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      service.listRecent(secretaria, 50, { scope: "organization" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("forbids membro", async () => {
    const service = new AuditService(
      { auditLog: { findMany: jest.fn() } } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(service.listRecent(member)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  const tesouraria: AuthUser = {
    userId: "u-tes",
    personId: "p-tes",
    email: "tesouraria.sintetica@example.test",
    organizationId: "org1",
    churchId: "church-rf1",
    grants: [
      {
        roleCode: "TESOURARIA",
        organizationId: "org1",
        churchId: "church-rf1",
      },
    ],
  };

  const sensitiveRow = {
    ...sampleRow,
    action: "ledger.entry.create",
    resourceType: "ledger_entry",
    resourceId: "entry-sintetico",
    metadata: {
      amountCents: 15000,
      fundId: "fund-sintetico",
      costCenterId: "cc-sintetico",
      competenceYear: 2026,
      competenceMonth: 11,
      pixKey: "pix.sintetico@example.test",
      description: "Dizimo sintetico da familia Exemplo",
      childName: "Menor Sintetico",
      birthDate: "2014-03-03",
      prayerRequest: "Pedido sintetico de oracao pela familia Exemplo",
      apiKey: "sk_test_sintetico_nao_usar",
      password: "senha-sintetica",
    },
  };

  const leakedFragments = [
    "pix.sintetico@example.test",
    "Dizimo sintetico da familia Exemplo",
    "Menor Sintetico",
    "2014-03-03",
    "Pedido sintetico de oracao pela familia Exemplo",
    "sk_test_sintetico_nao_usar",
    "senha-sintetica",
    "15000",
  ];

  it("redacts private metadata for the technical auditor without widening access", async () => {
    const prisma = {
      auditLog: {
        findMany: jest.fn().mockResolvedValue([
          sensitiveRow,
          { ...sampleRow, id: "l-op", action: "admission.create", metadata: { ok: true } },
        ]),
      },
    };
    const service = new AuditService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const debug = jest.spyOn(console, "debug").mockImplementation(() => {});
    const log = jest.spyOn(console, "log").mockImplementation(() => {});
    const info = jest.spyOn(console, "info").mockImplementation(() => {});
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const error = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      const result = await service.listRecent(platformAdmin, 20);
      const asSecretaria = await service.listRecent(secretaria, 20);
      expect(asSecretaria.logs.map((entry) => entry.action)).toEqual([
        "admission.create",
      ]);
      expect(result.scope).toBe("church");
      expect(result.logs[0]).toMatchObject({
        action: "ledger.entry.create",
        resourceType: "ledger_entry",
        resourceId: "entry-sintetico",
        actorUserId: "u-sec",
        sensitivity: "financial",
        metadata: {
          amountCents: "[redacted]",
          fundId: "fund-sintetico",
          costCenterId: "cc-sintetico",
          competenceYear: 2026,
          competenceMonth: 11,
          pixKey: "[redacted]",
          description: "[redacted]",
          childName: "[redacted]",
          birthDate: "[redacted]",
          prayerRequest: "[redacted]",
          apiKey: "[redacted]",
          password: "[redacted]",
        },
      });
      const serialized = JSON.stringify(result);
      for (const fragment of leakedFragments) {
        expect(serialized).not.toContain(fragment);
      }
      expect(JSON.stringify(asSecretaria)).not.toContain("entry-sintetico");
      expect(prisma.auditLog.findMany.mock.calls[1][0].where.AND).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ NOT: expect.any(Object) }),
        ]),
      );
      for (const spy of [debug, log, info, warn, error]) {
        expect(spy).not.toHaveBeenCalled();
      }
    } finally {
      debug.mockRestore();
      log.mockRestore();
      info.mockRestore();
      warn.mockRestore();
      error.mockRestore();
    }
  });

  it("forbids tesouraria and does not query audit rows", async () => {
    const findMany = jest.fn();
    const service = new AuditService(
      { auditLog: { findMany } } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(service.listRecent(tesouraria)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      service.listRecent(tesouraria, 50, { scope: "organization" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("applies the same redaction on organization scope", async () => {
    const prisma = {
      auditLog: {
        findMany: jest.fn().mockResolvedValue([sensitiveRow]),
      },
    };
    const service = new AuditService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const result = await service.listRecent(platformAdmin, 20, {
      scope: "organization",
    });
    expect(result.scope).toBe("organization");
    const serialized = JSON.stringify(result.logs[0]?.metadata);
    for (const fragment of leakedFragments) {
      expect(serialized).not.toContain(fragment);
    }
    expect(serialized).toContain("fund-sintetico");
  });

  const pastor: AuthUser = {
    userId: "u-pas",
    personId: "p-pas",
    email: "pastor.sintetico@example.test",
    organizationId: "org1",
    churchId: "church-rf1",
    grants: [
      {
        roleCode: "PASTOR",
        organizationId: "org1",
        churchId: "church-rf1",
      },
    ],
  };

  it("shows pastoral trails to the pastor and withholds financial types", async () => {
    const rows = [
      sensitiveRow,
      {
        ...sampleRow,
        id: "l-pastoral",
        action: "pastoral.case.create",
        resourceType: "pastoral_case",
        resourceId: "case-sintetico",
        metadata: {
          personId: "person-sintetico",
          prayerRequest: "Pedido sintetico de oracao pela familia Exemplo",
        },
      },
    ];
    const prisma = {
      auditLog: { findMany: jest.fn().mockResolvedValue(rows) },
    };
    const service = new AuditService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const result = await service.listRecent(pastor, 20);
    expect(result.logs.map((entry) => entry.action)).toEqual([
      "pastoral.case.create",
    ]);
    expect(JSON.stringify(result)).not.toContain(
      "Pedido sintetico de oracao pela familia Exemplo",
    );
    expect(JSON.stringify(result)).not.toContain("entry-sintetico");
    expect(result.logs[0]?.metadata).toMatchObject({
      personId: "person-sintetico",
      prayerRequest: "[redacted]",
    });
  });

  it("records a minimal denial when secretaria asks for another church", async () => {
    const created: Array<{ data: Record<string, unknown> }> = [];
    const findMany = jest.fn();
    const service = new AuditService(
      {
        auditLog: {
          findMany,
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn(async (args: { data: Record<string, unknown> }) => {
            created.push(args);
            return { id: "denial-1", createdAt: new Date("2026-11-11T12:00:00Z") };
          }),
        },
      } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      service.listRecent(secretaria, 20, {
        churchId: "church-rf2",
        correlationId: "pessoa.sintetica@example.test",
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(findMany).not.toHaveBeenCalled();
    expect(created).toHaveLength(1);
    const stored = JSON.stringify(created[0]);
    expect(stored).toContain("audit.read.denied");
    expect(stored).toContain("church_scope");
    expect(stored).not.toContain("pessoa.sintetica@example.test");
    expect(stored).not.toContain("church-rf2");
    expect(created[0]?.data.churchId).toBe("church-rf1");
    expect(created[0]?.data.actorUserId).toBe("u-sec");
  });

  it("rejects a filter that is not a safe token before querying", async () => {
    const findMany = jest.fn();
    const service = new AuditService(
      { auditLog: { findMany } } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    await expect(
      service.listRecent(secretaria, 20, {
        action: "pessoa.sintetica@example.test",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("pages with a cursor and does not repeat the first page", async () => {
    const rows = [
      { ...sampleRow, id: "l3", createdAt: new Date("2026-11-03T00:00:00Z") },
      { ...sampleRow, id: "l2", createdAt: new Date("2026-11-02T00:00:00Z") },
      { ...sampleRow, id: "l1", createdAt: new Date("2026-11-01T00:00:00Z") },
    ];
    const findMany = jest.fn(async (args: { take: number; where: { AND?: unknown[] } }) => {
      const cursor = args.where.AND?.find(
        (part) =>
          typeof part === "object" &&
          part !== null &&
          "OR" in part,
      ) as { OR?: Array<{ createdAt?: { lt?: Date } }> } | undefined;
      const before = cursor?.OR?.[0]?.createdAt?.lt;
      const filtered = before
        ? rows.filter((row) => row.createdAt.getTime() < before.getTime())
        : rows;
      return filtered.slice(0, args.take);
    });
    const service = new AuditService(
      { auditLog: { findMany } } as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
    );
    const first = await service.listRecent(secretaria, 2);
    expect(first.logs.map((entry) => entry.id)).toEqual(["l3", "l2"]);
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = await service.listRecent(secretaria, 2, {
      cursor: first.nextCursor ?? undefined,
    });
    expect(second.logs.map((entry) => entry.id)).toEqual(["l1"]);
    expect(second.nextCursor).toBeNull();
  });
});
