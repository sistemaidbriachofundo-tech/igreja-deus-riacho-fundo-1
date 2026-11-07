import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isStrongPersonDedupeMatch,
  normalizePersonSearchText,
  scorePersonDedupeMatch,
  tokenizePersonName,
} from "./person-dedupe";

describe("person-dedupe", () => {
  it("normalizes accents and case", () => {
    assert.equal(normalizePersonSearchText("  José  DA  Silva "), "jose da silva");
    assert.deepEqual(tokenizePersonName("Ana-Maria Demo"), ["ana", "maria", "demo"]);
  });

  it("scores exact email as strong match", () => {
    const hit = scorePersonDedupeMatch(
      { displayName: "Outro Nome", email: "ana.demo@example.test" },
      {
        id: "p1",
        displayName: "Ana Demo",
        email: "ana.demo@example.test",
      },
    );
    assert.equal(hit.matchReasons.includes("exactEmail"), true);
    assert.ok(hit.score >= 0.99);
    assert.equal(isStrongPersonDedupeMatch(hit.score, hit.matchReasons), true);
  });

  it("scores accent-insensitive exact name highly", () => {
    const hit = scorePersonDedupeMatch(
      { displayName: "Jose da Silva" },
      { id: "p2", displayName: "José da Silva", email: null },
    );
    assert.ok(hit.matchReasons.includes("normalizedDisplayName"));
    assert.ok(hit.score >= 0.95);
  });

  it("scores token overlap without claiming exact", () => {
    const hit = scorePersonDedupeMatch(
      { q: "Maria Silva" },
      { id: "p3", displayName: "Maria Aparecida Silva", email: null },
    );
    assert.ok(hit.matchReasons.includes("tokenOverlap") || hit.matchReasons.includes("displayName"));
    assert.ok(hit.score >= 0.5 && hit.score < 0.99);
  });

  it("returns zero when nothing matches", () => {
    const hit = scorePersonDedupeMatch(
      { displayName: "zzz", email: "nobody@example.test" },
      { id: "p4", displayName: "Bruno Demo", email: "bruno.demo@example.test" },
    );
    assert.equal(hit.score, 0);
    assert.deepEqual(hit.matchReasons, []);
  });
});
