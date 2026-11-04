import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assertPersonId, isPersonId, samePersonId } from "./person-id";

describe("person-id helpers", () => {
  it("accepts cuid-like person_id", () => {
    assert.equal(isPersonId("clxyz1234567890abcd"), true);
  });

  it("rejects short or empty values", () => {
    assert.equal(isPersonId(""), false);
    assert.equal(isPersonId("abc"), false);
    assert.equal(isPersonId(null), false);
    assert.equal(isPersonId(42), false);
  });

  it("assertPersonId trims and throws on invalid", () => {
    assert.equal(assertPersonId("  personid01  "), "personid01");
    assert.throws(() => assertPersonId("!!"), /person_id inválido/);
  });

  it("samePersonId compares trimmed values", () => {
    assert.equal(samePersonId("personid01", " personid01 "), true);
    assert.equal(samePersonId("personid01", "personid02"), false);
  });
});
