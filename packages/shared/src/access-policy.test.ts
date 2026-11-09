import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ROLE_CODES, type AuthGrant } from "./rbac";
import {
  ACCESS_POLICY_VERSION,
  IMPLICIT_GRANT_FINDINGS,
  evaluateAccess,
  formatAccessMatrix,
  resolveAccessPolicyMode,
  type AccessAction,
  type AccessRequest,
  type AccessResource,
} from "./access-policy";

const org = "org-rf1";
const church = "church-rf1";
const other = "church-rf2";

function grant(
  roleCode: AuthGrant["roleCode"],
  extra: Partial<AuthGrant> = {},
): AuthGrant {
  return {
    roleCode,
    organizationId: org,
    churchId: church,
    ...extra,
  };
}

function allow(
  grants: AuthGrant[],
  request: AccessRequest,
): boolean {
  return evaluateAccess(grants, {
    organizationId: org,
    churchId: church,
    mode: "strict",
    ...request,
  }).allow;
}

describe("access policy matrix", () => {
  it("versões e rollback", () => {
    assert.equal(ACCESS_POLICY_VERSION, "2026-11-09.a3.1");
    assert.equal(resolveAccessPolicyMode(undefined), "strict");
    assert.equal(resolveAccessPolicyMode(""), "strict");
    assert.equal(resolveAccessPolicyMode("legacy"), "legacy");
    assert.equal(resolveAccessPolicyMode("STRICT"), "strict");
  });

  it("matriz estrita nomeia papel, recurso, ação e escopo", () => {
    const lines = formatAccessMatrix("strict");
    assert.ok(lines.length >= 40);
    assert.ok(lines.includes("PASTOR pastoral.read church"));
    assert.ok(lines.includes("TESOURARIA ledger.read church"));
    assert.ok(lines.includes("TESOURARIA ledger.write church"));
    assert.ok(lines.includes("EDITOR_SITE cms.write church"));
    assert.ok(lines.includes("PUBLICADOR_SITE cms.publish church"));
    assert.ok(lines.includes("MEMBRO persons.read self"));
    assert.ok(lines.includes("LIDER_MINISTERIO ministries.write ministry"));
    assert.ok(lines.includes("PLATFORM_ADMIN admin.administer org"));
    assert.equal(
      lines.some((line) => line.startsWith("PLATFORM_ADMIN pastoral.")),
      false,
    );
    assert.equal(
      lines.some((line) => line.startsWith("PLATFORM_ADMIN ledger.")),
      false,
    );
    assert.equal(
      lines.some((line) => line.startsWith("EDITOR_SITE persons.")),
      false,
    );
    assert.equal(
      lines.some((line) => line.startsWith("PUBLICADOR_SITE persons.")),
      false,
    );
    assert.equal(
      formatAccessMatrix("legacy").some((line) =>
        line.startsWith("PLATFORM_ADMIN pastoral.approve"),
      ),
      true,
    );
  });

  it("registra achados CLOSED, BLOCKED e KEPT", () => {
    const statuses = new Set(IMPLICIT_GRANT_FINDINGS.map((item) => item.status));
    assert.deepEqual(statuses, new Set(["CLOSED", "BLOCKED", "KEPT"]));
    assert.ok(IMPLICIT_GRANT_FINDINGS.every((item) => item.summary.length > 20));
  });

  it("PLATFORM_ADMIN não lê pastoral nem ledger; TESOURARIA no mesmo token lê o caixa", () => {
    const admin = [grant(ROLE_CODES.PLATFORM_ADMIN, { churchId: null })];
    assert.equal(allow(admin, { resource: "pastoral", action: "read" }), false);
    assert.equal(allow(admin, { resource: "pastoral", action: "write" }), false);
    assert.equal(allow(admin, { resource: "pastoral", action: "approve" }), false);
    assert.equal(allow(admin, { resource: "ledger", action: "read" }), false);
    assert.equal(allow(admin, { resource: "ledger", action: "write" }), false);
    assert.equal(allow(admin, { resource: "admin", action: "administer" }), true);
    assert.equal(allow(admin, { resource: "persons", action: "search" }), true);
    assert.equal(allow(admin, { resource: "audit", action: "read" }), true);

    const both = [
      grant(ROLE_CODES.PLATFORM_ADMIN, { churchId: null }),
      grant(ROLE_CODES.TESOURARIA),
    ];
    assert.equal(allow(both, { resource: "ledger", action: "read" }), true);
    assert.equal(allow(both, { resource: "pastoral", action: "read" }), false);
  });

  it("modo legacy devolve a aprovação pastoral ao admin técnico", () => {
    const admin = [grant(ROLE_CODES.PLATFORM_ADMIN)];
    assert.equal(
      evaluateAccess(admin, {
        resource: "pastoral",
        action: "approve",
        organizationId: org,
        churchId: church,
        mode: "strict",
      }).allow,
      false,
    );
    assert.equal(
      evaluateAccess(admin, {
        resource: "pastoral",
        action: "approve",
        organizationId: org,
        churchId: church,
        mode: "legacy",
      }).allow,
      true,
    );
    assert.equal(
      evaluateAccess(admin, {
        resource: "pastoral",
        action: "read",
        organizationId: org,
        churchId: church,
        mode: "legacy",
      }).allow,
      false,
    );
  });

  it("EDITOR_SITE e PUBLICADOR_SITE ficam fora da secretaria", () => {
    const editor = [grant(ROLE_CODES.EDITOR_SITE)];
    const publisher = [grant(ROLE_CODES.PUBLICADOR_SITE)];
    for (const action of ["read", "search", "write"] as const) {
      assert.equal(allow(editor, { resource: "persons", action }), false);
      assert.equal(allow(publisher, { resource: "persons", action }), false);
    }
    assert.equal(allow(editor, { resource: "pastoral", action: "read" }), false);
    assert.equal(allow(editor, { resource: "ledger", action: "read" }), false);
    assert.equal(allow(editor, { resource: "ministries", action: "read" }), false);
    assert.equal(allow(editor, { resource: "cms", action: "read" }), true);
    assert.equal(allow(editor, { resource: "cms", action: "write" }), true);
    assert.equal(allow(editor, { resource: "cms", action: "publish" }), false);
    assert.equal(allow(publisher, { resource: "cms", action: "publish" }), true);
    assert.equal(allow(publisher, { resource: "admin", action: "administer" }), false);
  });

  it("secretaria, pastor, tesouraria, líder e membro respeitam recurso e congregação", () => {
    const cases: Array<{
      role: AuthGrant["roleCode"];
      resource: AccessResource;
      action: AccessAction;
      churchId?: string;
      ministryId?: string;
      actorPersonId?: string;
      subjectPersonId?: string;
      leaderPersonId?: string;
      expected: boolean;
    }> = [
      { role: ROLE_CODES.SECRETARIA, resource: "persons", action: "search", expected: true },
      { role: ROLE_CODES.SECRETARIA, resource: "persons", action: "write", expected: true },
      { role: ROLE_CODES.SECRETARIA, resource: "pastoral", action: "read", expected: false },
      { role: ROLE_CODES.SECRETARIA, resource: "ledger", action: "read", expected: false },
      { role: ROLE_CODES.SECRETARIA, resource: "cms", action: "publish", expected: false },
      { role: ROLE_CODES.SECRETARIA, resource: "persons", action: "read", churchId: other, expected: false },
      { role: ROLE_CODES.PASTOR, resource: "pastoral", action: "read", expected: true },
      { role: ROLE_CODES.PASTOR, resource: "pastoral", action: "approve", expected: true },
      { role: ROLE_CODES.PASTOR, resource: "ledger", action: "write", expected: false },
      { role: ROLE_CODES.PASTOR, resource: "persons", action: "write", expected: false },
      { role: ROLE_CODES.PASTOR, resource: "persons", action: "search", expected: true },
      { role: ROLE_CODES.PASTOR, resource: "pastoral", action: "read", churchId: other, expected: false },
      { role: ROLE_CODES.TESOURARIA, resource: "ledger", action: "read", expected: true },
      { role: ROLE_CODES.TESOURARIA, resource: "ledger", action: "write", expected: true },
      { role: ROLE_CODES.TESOURARIA, resource: "persons", action: "search", expected: false },
      { role: ROLE_CODES.TESOURARIA, resource: "pastoral", action: "read", expected: false },
      { role: ROLE_CODES.TESOURARIA, resource: "cms", action: "read", expected: false },
      { role: ROLE_CODES.TESOURARIA, resource: "ledger", action: "read", churchId: other, expected: false },
      { role: ROLE_CODES.LIDER_MINISTERIO, resource: "ministries", action: "read", expected: true },
      { role: ROLE_CODES.LIDER_MINISTERIO, resource: "ministries", action: "administer", expected: false },
      { role: ROLE_CODES.LIDER_MINISTERIO, resource: "persons", action: "search", expected: false },
      { role: ROLE_CODES.LIDER_MINISTERIO, resource: "ledger", action: "read", expected: false },
      { role: ROLE_CODES.LIDER_MINISTERIO, resource: "pastoral", action: "read", expected: false },
      { role: ROLE_CODES.MEMBRO, resource: "persons", action: "read", actorPersonId: "p1", subjectPersonId: "p1", expected: true },
      { role: ROLE_CODES.MEMBRO, resource: "persons", action: "read", actorPersonId: "p1", subjectPersonId: "p2", expected: false },
      { role: ROLE_CODES.MEMBRO, resource: "persons", action: "search", expected: false },
      { role: ROLE_CODES.MEMBRO, resource: "pastoral", action: "read", expected: false },
      { role: ROLE_CODES.MEMBRO, resource: "ledger", action: "read", expected: false },
      { role: ROLE_CODES.MEMBRO, resource: "cms", action: "write", expected: false },
      { role: ROLE_CODES.MEMBRO, resource: "ministries", action: "respond", expected: true },
      { role: ROLE_CODES.MEMBRO, resource: "ministries", action: "write", expected: false },
    ];

    for (const row of cases) {
      const ok = allow([grant(row.role, row.ministryId ? { ministryId: row.ministryId } : {})], {
        resource: row.resource,
        action: row.action,
        ...(row.churchId ? { churchId: row.churchId } : {}),
        ...(row.actorPersonId ? { actorPersonId: row.actorPersonId } : {}),
        ...(row.subjectPersonId ? { subjectPersonId: row.subjectPersonId } : {}),
        ...(row.leaderPersonId ? { leaderPersonId: row.leaderPersonId } : {}),
      });
      assert.equal(ok, row.expected, `${row.role} ${row.resource}.${row.action}`);
    }
  });

  it("líder escreve só o ministério do grant", () => {
    const lider = [grant(ROLE_CODES.LIDER_MINISTERIO, { ministryId: "min-jovens" })];
    assert.equal(
      allow(lider, {
        resource: "ministries",
        action: "write",
        ministryId: "min-jovens",
      }),
      true,
    );
    const denied = evaluateAccess(lider, {
      resource: "ministries",
      action: "write",
      organizationId: org,
      churchId: church,
      ministryId: "min-homens",
      mode: "strict",
    });
    assert.equal(denied.allow, false);
    assert.equal(denied.code, "MINISTRY_MISMATCH");
  });

  it("líder sem ministryId no grant depende do titular, salvo unknownLeader no guard", () => {
    const lider = [grant(ROLE_CODES.LIDER_MINISTERIO)];
    assert.equal(
      allow(lider, {
        resource: "ministries",
        action: "write",
        ministryId: "min-jovens",
        actorPersonId: "p-lider",
        leaderPersonId: "p-lider",
      }),
      true,
    );
    assert.equal(
      allow(lider, {
        resource: "ministries",
        action: "write",
        ministryId: "min-jovens",
        actorPersonId: "p-other",
        leaderPersonId: "p-lider",
      }),
      false,
    );
    assert.equal(
      allow(lider, {
        resource: "ministries",
        action: "write",
        ministryId: "min-jovens",
        actorPersonId: "p-other",
        leaderPersonId: "p-lider",
        unknownLeader: "allow",
      }),
      true,
    );
  });

  it("mede a decisão da matriz", () => {
    const grants = [
      grant(ROLE_CODES.SECRETARIA),
      grant(ROLE_CODES.TESOURARIA, { churchId: other }),
    ];
    const started = performance.now();
    const rounds = 20000;
    for (let i = 0; i < rounds; i += 1) {
      evaluateAccess(grants, {
        resource: i % 2 === 0 ? "persons" : "ledger",
        action: "read",
        organizationId: org,
        churchId: church,
        mode: "strict",
      });
    }
    const elapsedMs = performance.now() - started;
    const perCallUs = (elapsedMs * 1000) / rounds;
    console.log(
      `access-policy benchmark rounds=${rounds} elapsedMs=${elapsedMs.toFixed(2)} perCallUs=${perCallUs.toFixed(3)}`,
    );
    assert.ok(elapsedMs < 250, `matriz lenta: ${elapsedMs.toFixed(2)}ms`);
  });
});
