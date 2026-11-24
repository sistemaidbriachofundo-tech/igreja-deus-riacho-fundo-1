import { describe, expect, it } from "vitest";
import {
  advanceAdmission, beginAdmission, createVisitor, isEligible,
  isPersonList, nextStep, seed, setCredential,
  type Person, type Role, type Step,
} from "./demo-domain";

/**
 * Regression cases for the F2 demonstration's state machine.
 * These are CLIENT-SIDE illustration checks, not backend authorization tests.
 */
const fixture = (id: string): Person => {
  const found = seed().find((person) => person.id === id);
  if (!found) throw new Error("Fixture missing: " + id);
  return found;
};

function ok<T>(result: { ok: true; value: T } | { ok: false; code: string }): T {
  if (!result.ok) throw new Error("Unexpected demo error: " + result.code);
  return result.value;
}

describe("F2: admission transition matrix", () => {
  const steps: Step[] = ["documents", "secretaria", "pastor"];
  const roles: Role[] = ["SECRETARIA", "PASTOR", "MEMBRO"];

  it.each(steps.flatMap((step) => roles.map((role) => [step, role] as const)))(
    "checks transition %s for role %s",
    (step, role) => {
      const base = fixture("p-004");
      const current = step === "documents"
        ? ok(beginAdmission(fixture("p-003"), "SECRETARIA", "BATISMO"))
        : step === "secretaria"
          ? base
          : ok(advanceAdmission(base, "SECRETARIA", "secretaria"));
      const result = advanceAdmission(current, role, step);
      const expectedRole = step === "pastor" ? "PASTOR" : "SECRETARIA";
      expect(result.ok).toBe(role === expectedRole);
      if (!result.ok) expect(result.code).toBe("ROLE_REQUIRED");
    },
  );

  it.each(steps)("cannot skip forward directly to %s", (step) => {
    const pending = ok(beginAdmission(fixture("p-003"), "SECRETARIA", "BATISMO"));
    if (step === "documents") {
      expect(nextStep(pending)).toBe("documents");
      return;
    }
    const role = step === "pastor" ? "PASTOR" : "SECRETARIA";
    expect(advanceAdmission(pending, role, step)).toEqual({ ok: false, code: "STEP_LOCKED" });
  });

  it("blocks issuance until the pastor has completed the last step", () => {
    let person = ok(beginAdmission(fixture("p-003"), "SECRETARIA", "BATISMO"));
    for (const step of ["documents", "secretaria"] as const) {
      person = ok(advanceAdmission(person, "SECRETARIA", step));
      expect(isEligible(person)).toBe(false);
      expect(setCredential(person, "SECRETARIA", "ACTIVE")).toEqual({ ok: false, code: "NOT_ELIGIBLE" });
    }
    person = ok(advanceAdmission(person, "PASTOR", "pastor"));
    expect(isEligible(person)).toBe(true);
    expect(ok(setCredential(person, "SECRETARIA", "ACTIVE")).credential).toBe("ACTIVE");
  });

  it("never mutates the original person when issuing or revoking a demo credential", () => {
    const original = fixture("p-001");
    const issued = ok(setCredential(original, "SECRETARIA", "ACTIVE"));
    const revoked = ok(setCredential(issued, "SECRETARIA", "REVOKED"));
    expect(original.credential).toBe("NONE");
    expect(original.token).toBe("");
    expect(issued.credential).toBe("ACTIVE");
    expect(revoked.credential).toBe("REVOKED");
    expect(revoked).not.toBe(issued);
  });
});

describe("F2: demo storage and visitor validation boundaries", () => {
  it.each([
    [{ ...fixture("p-001"), id: "" }],
    [{ ...fixture("p-001"), token: 99 }],
    [{ ...fixture("p-001"), household: null }],
    [{ ...fixture("p-001"), checklist: [] }],
    [{ ...fixture("p-001"), checklist: { ...fixture("p-001").checklist, pastor: "yes" } }],
  ])("rejects corrupted cached person %#", (person) => {
    expect(isPersonList([person])).toBe(false);
  });

  it("rejects a duplicate ID even when the email is absent", () => {
    expect(createVisitor(seed(), "SECRETARIA", {
      name: "Pessoa Exemplo", email: "", household: "",
    }, "p-001")).toEqual({ ok: false, code: "INVALID_PERSON" });
  });

  it("normalizes whitespace and case before comparing duplicate email", () => {
    expect(createVisitor(seed(), "SECRETARIA", {
      name: "Pessoa Exemplo", email: " ANA@EXAMPLE.TEST ", household: "",
    }, "p-999")).toEqual({ ok: false, code: "DUPLICATE_EMAIL" });
  });

  it("cannot revoke an already revoked credential", () => {
    const issued = fixture("p-002");
    const revoked = ok(setCredential(issued, "SECRETARIA", "REVOKED"));
    expect(setCredential(revoked, "SECRETARIA", "REVOKED")).toEqual({
      ok: false, code: "CARD_NOT_ACTIVE",
    });
  });
});
