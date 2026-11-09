import { describe, expect, it } from "vitest";
import {
  advanceAdmission, beginAdmission, createVisitor, isEligible,
  isPersonList, nextStep, seed, selectVisible, setCredential,
  type Role,
} from "./demo-domain";

const person = (id: string) => {
  const found = seed().find((item) => item.id === id);
  if (!found) throw new Error("Fixture missing");
  return found;
};

describe("F2 demo: privacy and search boundaries", () => {
  it.each(["SECRETARIA", "PASTOR"] as Role[])("%s can search by trimmed, case-insensitive name, email or family", (role) => {
    expect(selectVisible(seed(), role, "  ANA DEMO  ").map((p) => p.id)).toEqual(["p-001"]);
    expect(selectVisible(seed(), role, "BRUNO@EXAMPLE.TEST").map((p) => p.id)).toEqual(["p-002"]);
    expect(selectVisible(seed(), role, "família exemplo").map((p) => p.id)).toEqual(["p-003", "p-004"]);
    expect(selectVisible(seed(), role, "não existe")).toEqual([]);
  });

  it("member search never exposes another member, even with a matching query", () => {
    expect(selectVisible(seed(), "MEMBRO", "Ana", "p-002").map((p) => p.id)).toEqual(["p-002"]);
    expect(selectVisible(seed(), "MEMBRO", "", "missing")).toEqual([]);
  });
});

describe("F2 demo: negative domain boundaries", () => {
  it.each(["PASTOR", "MEMBRO"] as Role[])("%s cannot create a visitor or start an admission", (role) => {
    expect(createVisitor(seed(), role, { name: "Exemplo", email: "", household: "" }, "new")).toEqual({ ok: false, code: "ROLE_REQUIRED" });
    expect(beginAdmission(person("p-003"), role, "BATISMO")).toEqual({ ok: false, code: "ROLE_REQUIRED" });
  });

  it("rejects blank names, malformed emails and invalid initial state", () => {
    for (const data of [
      { name: "   ", email: "", household: "" },
      { name: "Exemplo", email: "not-an-email", household: "" },
    ]) {
      expect(createVisitor(seed(), "SECRETARIA", data, "new")).toEqual({ ok: false, code: "INVALID_PERSON" });
    }
    expect(beginAdmission(person("p-001"), "SECRETARIA", "BATISMO")).toEqual({ ok: false, code: "INVALID_STATE" });
    expect(beginAdmission(undefined, "SECRETARIA", "BATISMO")).toEqual({ ok: false, code: "INVALID_STATE" });
  });

  it("cannot advance non-pending admissions or repeat a completed step", () => {
    expect(advanceAdmission(person("p-003"), "SECRETARIA", "documents")).toEqual({ ok: false, code: "INVALID_STATE" });
    expect(advanceAdmission(person("p-004"), "SECRETARIA", "documents")).toEqual({ ok: false, code: "STEP_LOCKED" });
    expect(nextStep(person("p-002"))).toBeNull();
  });

  it("pastor cannot issue or revoke credentials and missing persons cannot be issued", () => {
    expect(setCredential(person("p-001"), "PASTOR", "ACTIVE")).toEqual({ ok: false, code: "ROLE_REQUIRED" });
    expect(setCredential(person("p-002"), "MEMBRO", "REVOKED")).toEqual({ ok: false, code: "ROLE_REQUIRED" });
    expect(setCredential(undefined, "SECRETARIA", "ACTIVE")).toEqual({ ok: false, code: "INVALID_PERSON" });
    expect(setCredential(person("p-002"), "SECRETARIA", "ACTIVE")).toEqual({ ok: false, code: "CARD_ALREADY_ACTIVE" });
    expect(isEligible(person("p-003"))).toBe(false);
  });

  it("rejects malformed local cache and permits an empty cache", () => {
    expect(isPersonList([])).toBe(true);
    expect(isPersonList(Array.from({ length: 201 }, () => person("p-001")))).toBe(false);
    expect(isPersonList(null)).toBe(false);
    expect(isPersonList([{ ...person("p-001"), status: "UNKNOWN" }])).toBe(false);
  });
});
