import { redactAuditMetadata } from "./audit-metadata.redactor";
import {
  AUDIT_GENESIS_HASH,
  AUDIT_LEGACY_HASH,
  verifyAuditChain,
} from "./audit-chain";
import {
  AuditCommandError,
  AuditImmutableError,
  AuditWriteError,
} from "./audit-command";
import {
  AuditWriterService,
  type AuditWriteClient,
  type AuditWriteResult,
} from "./audit-writer.service";

const PASSWORD = "senha-sintetica";
const EMAIL = "pessoa.sintetica@example.test";
const PRAYER = "Pedido sintetico de oracao pela familia Exemplo";
const CPF = "000.000.000-00";

function actor(churchId: string | null = "church-rf1") {
  return {
    userId: "user-sintetico",
    organizationId: "org1",
    churchId,
  };
}

describe("AuditWriterService", () => {
  function client(options?: { failAction?: string }) {
    const rows: Array<Record<string, unknown> & { id: string; createdAt: Date }> = [];
    const db: AuditWriteClient = {
      auditLog: {
        findFirst: async (args) => {
          const found = rows
            .filter(
              (row) =>
                row.organizationId === args.where.organizationId &&
                row.churchId === args.where.churchId,
            )
            .sort((left, right) => {
              const byTime = right.createdAt.getTime() - left.createdAt.getTime();
              if (byTime !== 0) {
                return byTime;
              }
              return left.id < right.id ? 1 : -1;
            });
          const row = found[0];
          if (!row) {
            return null;
          }
          return {
            id: row.id,
            metadata: row.metadata,
            createdAt: row.createdAt,
          };
        },
        create: async ({ data }) => {
          if (options?.failAction && data.action === options.failAction) {
            throw new Error("disk offline marker");
          }
          const row = {
            ...data,
            id: `aud_${rows.length + 1}`,
            createdAt: data.createdAt,
          };
          rows.push(row);
          return { id: row.id, createdAt: row.createdAt };
        },
      },
    };
    return { db, rows };
  }

  function writer() {
    let tick = Date.parse("2026-11-11T12:00:00.000Z");
    const service = new AuditWriterService({} as never);
    service.now = () => new Date(tick += 1000);
    return service;
  }

  it("persists sanitized metadata, server actor and outcome, then rereads the same shape", async () => {
    const { db, rows } = client();
    const service = writer();
    const circular: Record<string, unknown> = {
      status: "OPEN",
      personId: "person-sintetico",
      actorUserId: "attacker-sintetico",
      email: EMAIL,
      outcome: "success",
      correlationId: "client-correlation",
      password: PASSWORD,
      pixKey: EMAIL,
      childName: "Menor Sintetico",
      birthDate: "2014-03-03",
      prayerRequest: PRAYER,
      documentBody: "Conteudo sintetico de documento",
      amountCents: 15000,
      code: CPF,
    };
    circular.filters = circular;

    const debug = jest.spyOn(console, "debug").mockImplementation(() => {});
    const log = jest.spyOn(console, "log").mockImplementation(() => {});
    try {
      const recorded = await service.write(db, {
        actor: actor(),
        action: "person.patch",
        resourceType: "person",
        resourceId: "person-sintetico",
        outcome: "denied",
        correlationId: "req-sintetico-1",
        metadata: circular,
      });
      expect(recorded.recorded).toBe(true);
      expect(recorded.id).toBe("aud_1");
      const stored = rows[0];
      expect(stored?.actorUserId).toBe("user-sintetico");
      expect(stored?.churchId).toBe("church-rf1");
      expect(stored?.createdAt).toBeInstanceOf(Date);
      const metadata = stored?.metadata as Record<string, unknown>;
      expect(metadata.outcome).toBe("denied");
      expect(metadata.correlationId).toBe("req-sintetico-1");
      expect(metadata.personId).toBe("person-sintetico");
      expect(metadata.status).toBe("OPEN");
      expect(metadata.prevHash).toBe(AUDIT_GENESIS_HASH);
      expect(metadata.entryHash).toEqual(expect.stringMatching(/^[a-f0-9]{64}$/));
      const serialized = JSON.stringify(stored);
      for (const secret of [
        PASSWORD,
        EMAIL,
        PRAYER,
        CPF,
        "attacker-sintetico",
        "client-correlation",
        "Menor Sintetico",
        "2014-03-03",
        "15000",
        "Conteudo sintetico de documento",
      ]) {
        expect(serialized).not.toContain(secret);
      }
      expect(redactAuditMetadata("person.patch", metadata)).toEqual(metadata);
      expect(debug).not.toHaveBeenCalled();
      expect(log).not.toHaveBeenCalled();
    } finally {
      debug.mockRestore();
      log.mockRestore();
    }
  });

  it("drops nested unicode secrets and oversized identifier lists", async () => {
    const { db, rows } = client();
    const service = writer();
    const marker = "z".repeat(79);
    const caseIds = Array.from({ length: 100 }, (_, index) =>
      index === 40 ? marker : `${String(index).padStart(2, "0")}${"a".repeat(77)}`,
    );
    await service.write(db, {
      actor: actor(),
      action: "pastoral.case.create",
      resourceType: "pastoral_case",
      resourceId: "case-sintetico",
      outcome: "success",
      metadata: {
        caseIds,
        filters: {
          summary: `oração ${"\u200b"}${EMAIL}`,
          name: `Louvor s${"\u0435"}nha`,
        },
        password: PASSWORD,
      },
    });
    const serialized = JSON.stringify(rows[0]);
    expect(serialized).not.toContain(marker);
    expect(serialized).not.toContain(EMAIL);
    expect(serialized).not.toContain(PASSWORD);
    expect(serialized).not.toContain("senha");
    expect((rows[0]?.metadata as { truncated?: boolean }).truncated).toBe(true);
  });

  it("refuses an invalid command before insert and fails closed when the insert fails", async () => {
    const { db, rows } = client({ failAction: "ledger.entry.create" });
    const service = writer();
    await expect(
      service.write(db, {
        actor: { ...actor(), userId: EMAIL },
        action: "person.patch",
        resourceType: "person",
        outcome: "success",
      }),
    ).rejects.toBeInstanceOf(AuditCommandError);
    expect(rows).toHaveLength(0);

    await expect(
      service.write(db, {
        actor: actor(),
        action: "ledger.entry.create",
        resourceType: "ledger_entry",
        resourceId: "entry-sintetico",
        outcome: "failure",
        bestEffort: true,
        metadata: { amountCents: 15000, password: PASSWORD },
      }),
    ).rejects.toBeInstanceOf(AuditWriteError);
    expect(rows).toHaveLength(0);
    try {
      await service.write(db, {
        actor: actor(),
        action: "ledger.entry.create",
        resourceType: "ledger_entry",
        outcome: "failure",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AuditWriteError);
      expect((error as Error).message).not.toContain("disk");
      expect((error as Error).message).not.toContain(PASSWORD);
    }
  });

  it("rolls the business write back when the sensitive audit insert fails", async () => {
    const committed: string[] = [];
    const service = writer();
    const prisma = {
      $transaction: async (
        run: (tx: AuditWriteClient) => Promise<unknown>,
      ) => {
        const staged: string[] = [];
        const tx: AuditWriteClient & { note: (value: string) => void } = {
          note: (value) => staged.push(value),
          auditLog: {
            findFirst: async () => null,
            create: async () => {
              throw new Error("audit insert failed");
            },
          },
        };
        try {
          const result = await run(tx);
          committed.push(...staged);
          return result;
        } catch (error) {
          return Promise.reject(error);
        }
      },
    };
    (service as unknown as { prisma: typeof prisma }).prisma = prisma;

    await expect(
      service.commitWith(actor(), async (tx) => {
        (tx as AuditWriteClient & { note: (value: string) => void }).note(
          "person-update",
        );
        return {
          result: { id: "person-sintetico" },
          event: {
            action: "person.patch",
            resourceType: "person",
            resourceId: "person-sintetico",
            outcome: "success" as const,
            metadata: { fields: ["status"] },
          },
        };
      }),
    ).rejects.toBeInstanceOf(AuditWriteError);
    expect(committed).toEqual([]);
  });

  it("commits the business row and the audit row together", async () => {
    const committed: string[] = [];
    const service = writer();
    const prisma = {
      $transaction: async (
        run: (tx: AuditWriteClient) => Promise<unknown>,
      ) => {
        const staged: string[] = [];
        const tx: AuditWriteClient & { note: (value: string) => void } = {
          note: (value) => staged.push(value),
          auditLog: {
            findFirst: async () => null,
            create: async ({ data }) => {
              staged.push(data.action);
              return { id: "aud_tx", createdAt: data.createdAt };
            },
          },
        };
        const result = await run(tx);
        committed.push(...staged);
        return result;
      },
    };
    (service as unknown as { prisma: typeof prisma }).prisma = prisma;
    const result = await service.commitWith(actor(), async (tx) => {
      (tx as AuditWriteClient & { note: (value: string) => void }).note(
        "household-create",
      );
      return {
        result: { id: "house-sintetico" },
        event: {
          action: "household.create",
          resourceType: "household",
          resourceId: "house-sintetico",
          outcome: "success" as const,
        },
      };
    });
    expect(result).toEqual({ id: "house-sintetico" });
    expect(committed).toEqual(["household-create", "household.create"]);
  });

  it("chains entries per church, links legacy rows, and breaks when tampered", async () => {
    const { db, rows } = client();
    rows.push({
      id: "legacy-1",
      actorUserId: "user-sintetico",
      action: "admission.create",
      resourceType: "admission_protocol",
      resourceId: "adm-1",
      organizationId: "org1",
      churchId: "church-rf1",
      metadata: { ok: true },
      createdAt: new Date("2026-11-01T00:00:00.000Z"),
    });
    const service = writer();
    await service.write(db, {
      actor: actor("church-rf1"),
      action: "admission.advance",
      resourceType: "admission_protocol",
      resourceId: "adm-1",
      outcome: "success",
      metadata: { step: "SECRETARIA" },
    });
    await service.write(db, {
      actor: actor("church-rf2"),
      action: "ministry.create",
      resourceType: "ministry",
      resourceId: "ministry-sintetico",
      outcome: "success",
      metadata: { name: "Louvor Sintético", slug: "louvor-sintetico" },
    });
    await service.write(db, {
      actor: actor("church-rf1"),
      action: "credential.issue",
      resourceType: "member_credential",
      resourceId: "cred-sintetico",
      outcome: "success",
    });

    const rf1 = rows.filter((row) => row.churchId === "church-rf1");
    const advance = rf1.find((row) => row.action === "admission.advance");
    const issue = rf1.find((row) => row.action === "credential.issue");
    const other = rows.find((row) => row.churchId === "church-rf2");
    expect((advance?.metadata as { prevId?: string }).prevId).toBe("legacy-1");
    expect((advance?.metadata as { prevHash?: string }).prevHash).toBe(
      AUDIT_LEGACY_HASH,
    );
    expect((issue?.metadata as { prevId?: string }).prevId).toBe(advance?.id);
    expect((other?.metadata as { prevHash?: string }).prevHash).toBe(
      AUDIT_GENESIS_HASH,
    );
    expect((other?.metadata as { prevId?: string }).prevId).toBeUndefined();

    const report = verifyAuditChain(
      rows.map((row) => ({
        id: String(row.id),
        organizationId: String(row.organizationId),
        churchId: (row.churchId as string | null) ?? null,
        createdAt: row.createdAt,
        action: String(row.action),
        resourceType: String(row.resourceType),
        resourceId: (row.resourceId as string | null) ?? null,
        actorUserId: (row.actorUserId as string | null) ?? null,
        metadata: row.metadata,
      })),
    );
    expect(report.provesInviolability).toBe(false);
    expect(report.intact).toBe(true);
    expect(report.legacy).toBe(1);
    expect(report.checked).toBe(3);

    const tampered = structuredClone(issue?.metadata) as { entryHash: string };
    tampered.entryHash = "c".repeat(64);
    const broken = verifyAuditChain([
      {
        id: String(issue?.id),
        organizationId: "org1",
        churchId: "church-rf1",
        createdAt: issue?.createdAt as Date,
        action: "credential.issue",
        resourceType: "member_credential",
        resourceId: "cred-sintetico",
        actorUserId: "user-sintetico",
        metadata: tampered,
      },
    ]);
    expect(broken.intact).toBe(false);
    expect(broken.provesInviolability).toBe(false);
  });

  it("stores a closed denial reason and swallows a logging failure", async () => {
    const { db, rows } = client();
    const service = writer();
    const recorded = await service.recordDenial(db, {
      actor: { ...actor(), userId: null },
      reason: EMAIL,
      correlationId: "req-denied-1",
    });
    expect(recorded.recorded).toBe(true);
    const serialized = JSON.stringify(rows[0]);
    expect(serialized).toContain("policy");
    expect(serialized).toContain("denied");
    expect(serialized).not.toContain(EMAIL);
    expect(rows[0]?.actorUserId).toBeNull();

    const failing = client({ failAction: "audit.read.denied" });
    const swallowed: AuditWriteResult = await service.recordDenial(failing.db, {
      actor: actor(),
      reason: "role",
    });
    expect(swallowed.recorded).toBe(false);
    expect(failing.rows).toHaveLength(0);
  });

  it("counts old rows for review and refuses purge, update and delete", async () => {
    const count = jest.fn().mockResolvedValue(139);
    const remove = jest.fn();
    const service = writer();
    service.now = () => new Date("2026-11-11T00:00:00.000Z");
    const report = await service.inspectRetention(
      { auditLog: { count } },
      "org1",
    );
    expect(report.destroysRows).toBe(false);
    expect(report.deleted).toBe(0);
    expect(report.olderThanReviewWindow).toBe(139);
    expect(report.mode).toBe("preserve");
    expect(remove).not.toHaveBeenCalled();
    expect(() => service.purge()).toThrow(AuditImmutableError);
    expect(() => service.update()).toThrow(AuditImmutableError);
    expect(() => service.delete()).toThrow(AuditImmutableError);
  });
});
