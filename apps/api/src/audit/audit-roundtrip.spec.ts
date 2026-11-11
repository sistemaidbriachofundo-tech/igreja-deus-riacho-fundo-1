import { AuditService } from "./audit.service";
import { verifyAuditChain } from "./audit-chain";
import { redactAuditMetadata } from "./audit-metadata.redactor";
import { AuditWriterService, type AuditWriteClient } from "./audit-writer.service";
import type { AuthUser } from "../auth/types/auth-user";

type Row = {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  actorUserId: string | null;
  organizationId: string | null;
  churchId: string | null;
  metadata: unknown;
  createdAt: Date;
};

function matches(row: Row, where: unknown): boolean {
  if (!where || typeof where !== "object") {
    return true;
  }
  const spec = where as Record<string, unknown>;
  if (Array.isArray(spec.AND) && !spec.AND.every((part) => matches(row, part))) {
    return false;
  }
  if (Array.isArray(spec.OR) && !spec.OR.some((part) => matches(row, part))) {
    return false;
  }
  if (spec.NOT && matches(row, spec.NOT)) {
    return false;
  }
  for (const key of ["organizationId", "churchId", "action", "resourceType", "id"] as const) {
    if (!(key in spec)) {
      continue;
    }
    const expected = spec[key];
    const actual = row[key];
    if (expected && typeof expected === "object") {
      const op = expected as { startsWith?: string; contains?: string; lt?: string };
      const text = String(actual ?? "");
      if (op.startsWith && !text.startsWith(op.startsWith)) {
        return false;
      }
      if (op.contains && !text.includes(op.contains)) {
        return false;
      }
      if (op.lt !== undefined && !(text < op.lt)) {
        return false;
      }
    } else if (actual !== expected) {
      return false;
    }
  }
  if (spec.createdAt && typeof spec.createdAt === "object") {
    const op = spec.createdAt as { lt?: Date; lte?: Date; gte?: Date };
    const time = row.createdAt.getTime();
    if (op.lt && !(time < op.lt.getTime())) {
      return false;
    }
    if (op.lte && !(time <= op.lte.getTime())) {
      return false;
    }
    if (op.gte && !(time >= op.gte.getTime())) {
      return false;
    }
  }
  if (spec.metadata && typeof spec.metadata === "object") {
    const meta = spec.metadata as { path?: string[]; equals?: unknown };
    let current: unknown = row.metadata;
    for (const part of meta.path ?? []) {
      if (!current || typeof current !== "object") {
        return false;
      }
      current = (current as Record<string, unknown>)[part];
    }
    if (meta.equals !== undefined && current !== meta.equals) {
      return false;
    }
  }
  return true;
}

function memory() {
  const rows: Row[] = [];
  const db = {
    auditLog: {
      findFirst: async (args: {
        where: { organizationId: string; churchId: string | null };
      }) => {
        const found = rows
          .filter(
            (row) =>
              row.organizationId === args.where.organizationId &&
              row.churchId === args.where.churchId,
          )
          .sort(
            (left, right) =>
              right.createdAt.getTime() - left.createdAt.getTime() ||
              (left.id < right.id ? 1 : -1),
          );
        return found[0] ?? null;
      },
      create: async ({
        data,
      }: {
        data: Omit<Row, "id">;
      }) => {
        const row: Row = { ...data, id: `aud_${rows.length + 1}` };
        rows.push(row);
        return { id: row.id, createdAt: row.createdAt };
      },
      findMany: async (args: { where: unknown; take: number }) => {
        return rows
          .filter((row) => matches(row, args.where))
          .sort(
            (left, right) =>
              right.createdAt.getTime() - left.createdAt.getTime() ||
              (left.id < right.id ? 1 : -1),
          )
          .slice(0, args.take);
      },
      count: async () => rows.length,
    },
  };
  return { db, rows };
}

function user(
  role: string,
  churchId: string | null,
  organizationId = "org1",
): AuthUser {
  return {
    userId: `user-${role.toLowerCase()}-${churchId ?? "org"}`,
    personId: `person-${role.toLowerCase()}`,
    email: `${role.toLowerCase()}.sintetico@example.test`,
    organizationId,
    churchId,
    grants: [
      {
        roleCode: role,
        organizationId,
        churchId: role === "PLATFORM_ADMIN" ? null : churchId,
      },
    ],
  };
}

describe("audit write and read across congregations", () => {
  const pilot = {
    organizationId: "org1",
    churchId: "church-rf1",
    organizationSlug: "igreja-de-deus",
    churchSlug: "riacho-fundo-1",
    churchName: "Riacho Fundo I (demo)",
  };

  it("creates events, rereads them by persona, and keeps congregations apart", async () => {
    const { db, rows } = memory();
    let tick = Date.parse("2026-11-11T15:00:00.000Z");
    const writer = new AuditWriterService(db as never);
    writer.now = () => new Date((tick += 1000));
    const reader = new AuditService(
      db as never,
      { getPilotChurch: async () => pilot } as never,
      writer,
    );
    const secretaria = user("SECRETARIA", "church-rf1");
    const pastor = user("PASTOR", "church-rf1");
    const other = user("SECRETARIA", "church-rf2");
    const admin = user("PLATFORM_ADMIN", null);

    await writer.write(db as unknown as AuditWriteClient, {
      actor: {
        userId: secretaria.userId,
        organizationId: "org1",
        churchId: "church-rf1",
      },
      action: "admission.create",
      resourceType: "admission_protocol",
      resourceId: "adm-sintetico",
      outcome: "success",
      correlationId: "req-adm-1",
      metadata: { step: "SECRETARIA", reason: "Pedido sintetico de oracao" },
    });
    await writer.write(db as unknown as AuditWriteClient, {
      actor: {
        userId: pastor.userId,
        organizationId: "org1",
        churchId: "church-rf1",
      },
      action: "pastoral.case.create",
      resourceType: "pastoral_case",
      resourceId: "case-sintetico",
      outcome: "success",
      metadata: { personId: "person-sintetico", prayerRequest: "Pedido sintetico de oracao" },
    });
    await writer.write(db as unknown as AuditWriteClient, {
      actor: {
        userId: "user-tesouraria",
        organizationId: "org1",
        churchId: "church-rf1",
      },
      action: "ledger.entry.create",
      resourceType: "ledger_entry",
      resourceId: "entry-sintetico",
      outcome: "success",
      metadata: { fundId: "fund-sintetico", amountCents: 15000, pixKey: "pessoa.sintetica@example.test" },
    });
    await writer.write(db as unknown as AuditWriteClient, {
      actor: {
        userId: other.userId,
        organizationId: "org1",
        churchId: "church-rf2",
      },
      action: "cms.create",
      resourceType: "cms_content",
      resourceId: "cms-sintetico",
      outcome: "success",
    });

    const asSecretaria = await reader.listRecent(secretaria, 20);
    expect(asSecretaria.logs.map((entry) => entry.action)).toEqual([
      "admission.create",
    ]);
    expect(asSecretaria.churchId).toBe("church-rf1");
    expect(JSON.stringify(asSecretaria)).not.toContain("case-sintetico");
    expect(JSON.stringify(asSecretaria)).not.toContain("entry-sintetico");
    expect(JSON.stringify(asSecretaria)).not.toContain("cms-sintetico");
    expect(JSON.stringify(asSecretaria)).not.toContain("Pedido sintetico de oracao");
    expect(asSecretaria.logs[0]?.outcome).toBe("success");
    expect(asSecretaria.logs[0]?.metadata).toMatchObject({
      step: "SECRETARIA",
      reason: "[redacted]",
      correlationId: "req-adm-1",
    });

    const asPastor = await reader.listRecent(pastor, 20);
    expect(asPastor.logs.map((entry) => entry.action).sort()).toEqual([
      "admission.create",
      "pastoral.case.create",
    ]);
    expect(JSON.stringify(asPastor)).not.toContain("entry-sintetico");
    expect(JSON.stringify(asPastor)).not.toContain("pessoa.sintetica@example.test");

    const asOther = await reader.listRecent(other, 20);
    expect(asOther.logs.map((entry) => entry.action)).toEqual(["cms.create"]);

    const exported = await reader.exportSanitized(admin, 20, {
      scope: "organization",
    });
    expect(exported.scope).toBe("organization");
    expect(exported.sanitized).toBe(true);
    expect(exported.integrity.provesInviolability).toBe(false);
    expect(exported.retention.destroysRows).toBe(false);
    expect(exported.logs.map((entry) => entry.churchId).sort()).toEqual([
      "church-rf1",
      "church-rf1",
      "church-rf1",
      "church-rf2",
    ]);
    expect(JSON.stringify(exported.logs)).not.toContain("pessoa.sintetica@example.test");
    expect(JSON.stringify(exported.logs)).not.toContain("15000");

    const chain = verifyAuditChain(rows);
    expect(chain.intact).toBe(true);
    expect(chain.provesInviolability).toBe(false);
    expect(chain.checked).toBe(4);
    expect(
      rows.every(
        (row) =>
          JSON.stringify(redactAuditMetadata(row.action, row.metadata)) ===
          JSON.stringify(row.metadata),
      ),
    ).toBe(true);
  });
});
