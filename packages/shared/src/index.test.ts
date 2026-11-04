import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { APP_SLUG, createHealthStatus, ROLE_CODES, isPersonId } from "./index";

describe("shared", () => {
  it("exports app slug", () => {
    assert.equal(APP_SLUG, "igreja-deus-riacho-fundo-1");
  });

  it("creates health status", () => {
    const health = createHealthStatus("api");
    assert.equal(health.status, "ok");
    assert.equal(health.service, "api");
    assert.ok(health.timestamp);
  });

  it("exports IAM building blocks", () => {
    assert.equal(ROLE_CODES.PLATFORM_ADMIN, "PLATFORM_ADMIN");
    assert.equal(isPersonId("cuidperson01"), true);
  });
});
