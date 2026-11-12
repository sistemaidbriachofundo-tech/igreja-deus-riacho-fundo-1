import { existsSync } from "node:fs";
import path from "node:path";
import {
  AUDIT_INTEGRATOR,
  AUDIT_SCHEMA_HANDOFF,
  AUDIT_WIRING_DOMAINS,
  AUDIT_WIRING_PLAN,
} from "./audit-integrator.contract";

describe("audit integrator contract", () => {
  const root = path.resolve(__dirname, "../../../..");

  it("covers every domain and only points at files that exist outside this folder", () => {
    expect(AUDIT_INTEGRATOR.migrationInThisChange).toBe(false);
    expect(AUDIT_INTEGRATOR.preservesExistingRows).toBe(true);
    expect(AUDIT_INTEGRATOR.baseSha).toBe(
      "31d3158c7619bbc4c9d24fd9b94e43ef056ab80e",
    );
    expect(AUDIT_SCHEMA_HANDOFF.integrity).toContain("SHA-256");
    expect(AUDIT_SCHEMA_HANDOFF.immutability.toLowerCase()).toContain(
      "inviolab",
    );
    expect(AUDIT_SCHEMA_HANDOFF.treasuryCaveat).toContain("idempotencyKey");

    const domains = new Set(AUDIT_WIRING_PLAN.map((point) => point.domain));
    expect([...domains].sort()).toEqual([...AUDIT_WIRING_DOMAINS].sort());

    for (const point of AUDIT_WIRING_PLAN) {
      expect(point.sensitive).toBe(true);
      expect(point.file.startsWith("apps/api/src/audit/")).toBe(false);
      expect(existsSync(path.join(root, point.file))).toBe(true);
      expect(point.actions.length).toBeGreaterThan(0);
    }
  });
});
