import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkBalancedLines,
  isValidCompetence,
  nextDualApprovalStage,
  parseSyntheticCsvLines,
} from "./ledger-rules";
import { dedupeStatementLines } from "./statement-text";

describe("ledger-rules", () => {
  it("accepts balanced debit/credit lines", () => {
    const result = checkBalancedLines([
      { accountId: "a1", side: "DEBIT", amountCents: 15000 },
      { accountId: "a2", side: "CREDIT", amountCents: 15000 },
    ]);
    assert.equal(result.ok, true);
    assert.equal(result.amountCents, 15000);
  });

  it("rejects unbalanced lines", () => {
    const result = checkBalancedLines([
      { accountId: "a1", side: "DEBIT", amountCents: 100 },
      { accountId: "a2", side: "CREDIT", amountCents: 50 },
    ]);
    assert.equal(result.ok, false);
    assert.equal(result.reason, "UNBALANCED");
  });

  it("rejects missing opposite side", () => {
    const result = checkBalancedLines([
      { accountId: "a1", side: "DEBIT", amountCents: 100 },
    ]);
    assert.equal(result.ok, false);
    assert.equal(result.reason, "MISSING_SIDE");
  });

  it("enforces dual-approval distinct actors", () => {
    assert.deepEqual(
      nextDualApprovalStage({
        actorUserId: "u1",
        createdByUserId: "u1",
        firstApprovedByUserId: null,
      }),
      { ok: false, code: "APPROVER_IS_CREATOR" },
    );
    assert.deepEqual(
      nextDualApprovalStage({
        actorUserId: "u2",
        createdByUserId: "u1",
        firstApprovedByUserId: null,
      }),
      { ok: true, stage: "FIRST" },
    );
    assert.deepEqual(
      nextDualApprovalStage({
        actorUserId: "u2",
        createdByUserId: "u1",
        firstApprovedByUserId: "u2",
      }),
      { ok: false, code: "APPROVER_ALREADY_FIRST" },
    );
    assert.deepEqual(
      nextDualApprovalStage({
        actorUserId: "u3",
        createdByUserId: "u1",
        firstApprovedByUserId: "u2",
      }),
      { ok: true, stage: "SECOND" },
    );
  });

  it("parses synthetic CSV stub rows", () => {
    const rows = parseSyntheticCsvLines(
      "date,amountCents,description\n2026-11-01,25000,Oferta demo,ref-1\n\nbad\n2026-11-02,-5000,Saque demo",
    );
    assert.equal(rows.length, 2);
    assert.equal(rows[0].amountCents, 25000);
    assert.equal(rows[0].externalRef, "ref-1");
    assert.equal(rows[1].amountCents, -5000);
    const hostile = parseSyntheticCsvLines("2026-11-03,10,=cmd|calc");
    assert.equal(hostile[0].description.startsWith("'"), true);
    assert.equal(hostile[0].description.includes("<"), false);
  });

  it("deduplica extrato pelo identificador e pela identidade do movimento", () => {
    const incoming = [
      { postedAt: "2026-11-02", amountCents: 25000, description: "Oferta", externalRef: "FIT-1" },
      { postedAt: "2026-11-02", amountCents: 25000, description: "Oferta", externalRef: "FIT-1" },
      { postedAt: "2026-11-02", amountCents: 25000, description: "Oferta", externalRef: null },
      { postedAt: "2026-11-03", amountCents: -5000, description: "=saque", externalRef: null },
    ];
    const first = dedupeStatementLines(incoming);
    assert.equal(first.kept.length, 2);
    assert.equal(first.skipped, 2);
    assert.equal(first.kept[1].description, "'=saque");
    const again = dedupeStatementLines(first.kept, first.kept);
    assert.equal(again.kept.length, 0);
    assert.equal(again.skipped, 2);
  });

  it("validates competence year/month", () => {
    assert.equal(isValidCompetence(2026, 11), true);
    assert.equal(isValidCompetence(2026, 0), false);
    assert.equal(isValidCompetence(1999, 1), false);
  });
});
