import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyAccessRoute, normalizeAccessPath } from "./access-routes";

describe("classifyAccessRoute", () => {
  it("normaliza query e barra", () => {
    assert.equal(normalizeAccessPath("persons/search?q=ana"), "/persons/search");
    assert.equal(normalizeAccessPath("/ledger/accounts/"), "/ledger/accounts");
  });

  it("classifica persons, pastoral, ledger, ministries, cms e admin", () => {
    assert.deepEqual(classifyAccessRoute("GET", "/persons/search?q=ana"), {
      resource: "persons",
      action: "search",
    });
    assert.deepEqual(classifyAccessRoute("POST", "/persons/candidates"), {
      resource: "persons",
      action: "search",
    });
    assert.deepEqual(classifyAccessRoute("GET", "/persons/p1/dossier"), {
      resource: "persons",
      action: "read",
      personId: "p1",
    });
    assert.deepEqual(classifyAccessRoute("PATCH", "/persons/p1"), {
      resource: "persons",
      action: "write",
      personId: "p1",
    });
    assert.deepEqual(classifyAccessRoute("GET", "/pastoral-cases/c1"), {
      resource: "pastoral",
      action: "read",
    });
    assert.deepEqual(classifyAccessRoute("POST", "/pastoral-cases"), {
      resource: "pastoral",
      action: "write",
    });
    assert.deepEqual(classifyAccessRoute("GET", "/ledger/accounts"), {
      resource: "ledger",
      action: "read",
    });
    assert.deepEqual(classifyAccessRoute("POST", "/ledger/entries"), {
      resource: "ledger",
      action: "write",
    });
    assert.deepEqual(classifyAccessRoute("POST", "/ministries"), {
      resource: "ministries",
      action: "administer",
    });
    assert.deepEqual(classifyAccessRoute("GET", "/ministries"), {
      resource: "ministries",
      action: "read",
    });
    assert.deepEqual(classifyAccessRoute("PATCH", "/ministries/min-jovens"), {
      resource: "ministries",
      action: "write",
      ministryId: "min-jovens",
    });
    assert.deepEqual(classifyAccessRoute("POST", "/assignments/a1/confirm"), {
      resource: "ministries",
      action: "respond",
    });
    assert.deepEqual(classifyAccessRoute("POST", "/assignments/a1/substitute"), {
      resource: "ministries",
      action: "write",
    });
    assert.deepEqual(classifyAccessRoute("POST", "/cms/site-layout/publish"), {
      resource: "cms",
      action: "publish",
    });
    assert.deepEqual(classifyAccessRoute("PATCH", "/cms/site-layout/draft"), {
      resource: "cms",
      action: "write",
    });
    assert.deepEqual(classifyAccessRoute("GET", "/cms/contents"), {
      resource: "cms",
      action: "read",
    });
    assert.deepEqual(classifyAccessRoute("PUT", "/auth/oidc/config"), {
      resource: "admin",
      action: "administer",
    });
    assert.deepEqual(classifyAccessRoute("GET", "/audit-logs"), {
      resource: "audit",
      action: "read",
    });
    assert.equal(classifyAccessRoute("GET", "/auth/oidc/authorize"), null);
    assert.equal(classifyAccessRoute("GET", "/health"), null);
  });
});
