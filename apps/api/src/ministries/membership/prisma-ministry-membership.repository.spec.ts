import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MEMBERSHIP_LIST_SQL,
  PrismaMinistryMembershipRepository,
} from "./prisma-ministry-membership.repository";
import type { StoredMembership } from "./ministry-membership.model";

const scope = {
  organizationId: "org1",
  churchId: "church-rf1",
  ministryId: "min-jovens",
};

function row(overrides: Partial<StoredMembership> = {}): StoredMembership {
  return {
    id: "mmb-1",
    organizationId: scope.organizationId,
    churchId: scope.churchId,
    ministryId: scope.ministryId,
    personId: "per-jovem",
    displayName: "Jovem Sintético",
    role: "INTEGRANTE",
    status: "ATIVO",
    source: "DIRETO",
    volunteerInterestId: null,
    startedAt: "2026-11-09T12:00:00.000Z",
    endedAt: null,
    ...overrides,
  };
}

describe("PrismaMinistryMembershipRepository", () => {
  it("BLOCKED: to_regclass nulo não emite leitura nem escrita", async () => {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes("to_regclass")) return [{ regclass: null }];
      return [{ email: "nao-deve-ler@example.test" }];
    });
    const repository = new PrismaMinistryMembershipRepository({
      $queryRawUnsafe: query,
      person: { findFirst: jest.fn() },
      volunteerInterest: { findFirst: jest.fn() },
      auditLog: { create: jest.fn() },
    });

    await expect(repository.probe()).resolves.toBe("schema_blocked");
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toBe(
      "SELECT to_regclass('public.ministry_memberships') AS regclass",
    );
  });

  it("sonda a tabela pronta e a listagem exige org, igreja e ministério", async () => {
    const calls: Array<{ sql: string; values: unknown[] }> = [];
    const query = jest.fn(async (sql: string, ...values: unknown[]) => {
      calls.push({ sql, values });
      if (sql.includes("to_regclass")) return [{ regclass: "ministry_memberships" }];
      return [
        row(),
        {
          ...row({ id: "mmb-lixo", role: "VISITANTE" as "INTEGRANTE" }),
          email: "vazou@example.test",
          phone: "000",
          notes_internal: "sigilo",
        },
      ];
    });
    const repository = new PrismaMinistryMembershipRepository({
      $queryRawUnsafe: query,
      person: { findFirst: jest.fn() },
      volunteerInterest: { findFirst: jest.fn() },
      auditLog: { create: jest.fn() },
    });

    await expect(repository.probe()).resolves.toBe("ready");
    const members = await repository.list(scope);
    expect(members).toEqual([row()]);
    const list = calls.find((call) => call.sql === MEMBERSHIP_LIST_SQL);
    expect(list?.values).toEqual([scope.organizationId, scope.churchId, scope.ministryId]);
    expect(MEMBERSHIP_LIST_SQL).toContain("organization_id = $1");
    expect(MEMBERSHIP_LIST_SQL).toContain("church_id = $2");
    expect(MEMBERSHIP_LIST_SQL).toContain("ministry_id = $3");
    expect(MEMBERSHIP_LIST_SQL).not.toContain("email");
    expect(MEMBERSHIP_LIST_SQL).not.toContain("phone");
    expect(MEMBERSHIP_LIST_SQL).not.toContain("notes");
    expect(JSON.stringify(members)).not.toContain("example.test");
  });

  it("a pessoa e o interesse são lidos só no escopo, sem contato", async () => {
    const personQueries: Array<{ where: Record<string, unknown>; select: { id: true; displayName: true } }> = [];
    const interestQueries: Array<{ where: Record<string, unknown>; select: Record<string, true> }> = [];
    const auditEntries: Array<{ data: { metadata: Record<string, string | null> } }> = [];
    const person = jest.fn(async (query: { where: Record<string, unknown>; select: { id: true; displayName: true } }) => {
      personQueries.push(query);
      return { id: "per-jovem", displayName: "Jovem Sintético" };
    });
    const interest = jest.fn(async (query: { where: Record<string, unknown>; select: Record<string, true> }) => {
      interestQueries.push(query);
      return null;
    });
    const audit = jest.fn(async (entry: { data: { metadata: Record<string, string | null> } }) => {
      auditEntries.push(entry);
      return { id: "aud-1" };
    });
    const repository = new PrismaMinistryMembershipRepository({
      $queryRawUnsafe: jest.fn(),
      person: { findFirst: person },
      volunteerInterest: { findFirst: interest },
      auditLog: { create: audit },
    });

    await repository.findPerson(scope, "per-jovem");
    await repository.findInterest(scope, "int-jovens");
    await repository.recordAudit({
      actorUserId: "usr-lider-jovens",
      action: "ministry_membership.admit",
      resourceId: "mmb-1",
      organizationId: scope.organizationId,
      churchId: scope.churchId,
      metadata: {
        ministryId: scope.ministryId,
        personId: "per-jovem",
        role: "INTEGRANTE",
        status: "ATIVO",
        previousStatus: null,
        source: "DIRETO",
        volunteerInterestId: null,
      },
    });

    expect(personQueries[0]).toMatchObject({
      select: { id: true, displayName: true },
      where: {
        id: "per-jovem",
        organizationId: scope.organizationId,
        status: "ACTIVE",
      },
    });
    expect(JSON.stringify(personQueries[0]?.select)).not.toContain("email");
    expect(interestQueries[0]).toMatchObject({
      where: {
        id: "int-jovens",
        organizationId: scope.organizationId,
        churchId: scope.churchId,
        ministryId: scope.ministryId,
      },
    });
    expect(JSON.stringify(interestQueries[0]?.select)).not.toContain("email");
    expect(JSON.stringify(interestQueries[0]?.select)).not.toContain("phone");
    expect(JSON.stringify(interestQueries[0]?.select)).not.toContain("message");
    expect(auditEntries[0]?.data.metadata).not.toHaveProperty("email");
  });

  it("falha de sonda mantém o vínculo bloqueado", async () => {
    const repository = new PrismaMinistryMembershipRepository({
      $queryRawUnsafe: async () => {
        throw new Error("relation does not exist");
      },
      person: { findFirst: jest.fn() },
      volunteerInterest: { findFirst: jest.fn() },
      auditLog: { create: jest.fn() },
    });
    await expect(repository.probe()).resolves.toBe("schema_blocked");
  });

  it("o SQL proposto ao integrador permanece fora de schema e migrations", () => {
    const contract = readFileSync(
      join(__dirname, "../../../../../docs/contratos/a6-vinculo-formal-ministerio.md"),
      "utf8",
    );
    expect(contract).toContain("ministry_memberships");
    expect(contract).toContain("BLOCKED");
    const schema = readFileSync(
      join(__dirname, "../../../../../packages/db/prisma/schema.prisma"),
      "utf8",
    );
    expect(schema).not.toContain("model MinistryMembership");
  });
});
