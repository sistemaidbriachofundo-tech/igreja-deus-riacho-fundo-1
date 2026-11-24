import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PREVENTIVE_COPY,
  cpfDigits,
  familyLinkDecision,
  homonymWarningEnabled,
  identityDecision,
  isValidCpf,
  ledgerDuplicateDecision,
  normalizePersonName,
  scheduleCommitDecision,
  scheduleMode,
} from "./preventive-ux";

const secret = "52998224725";

describe("preventive ux decisions", () => {
  it("accepts a valid CPF and rejects the raw number from being echoed by normalization of names", () => {
    assert.equal(isValidCpf(secret), true);
    assert.equal(isValidCpf("111.111.111-11"), false);
    assert.equal(cpfDigits("529.982.247-25"), secret);
    assert.equal(normalizePersonName("  Ána   Souza "), "ana souza");
  });

  it("blocks exact identity for secretaria and never blocks a homonym", () => {
    const exact = identityDecision({
      acknowledgeHomonym: true,
      homonymWarning: false,
      fingerprintHit: { id: "p1", status: "ACTIVE" },
    });
    assert.equal(exact.action, "conflict");
    assert.equal(exact.code, "PERSON_IDENTITY_EXACT");
    assert.equal(exact.blocking, true);
    assert.deepEqual(exact.existing, { id: "p1", status: "ACTIVE" });

    const warned = identityDecision({
      acknowledgeHomonym: false,
      homonymWarning: true,
      homonymHit: { id: "p2", status: "ACTIVE" },
    });
    assert.equal(warned.code, "PERSON_POSSIBLE_HOMONYM");
    assert.equal(warned.blocking, false);

    const continued = identityDecision({
      acknowledgeHomonym: true,
      homonymWarning: true,
      homonymHit: { id: "p2", status: "ACTIVE" },
    });
    assert.equal(continued.action, "allow");
    assert.equal(homonymWarningEnabled("block"), true);
    assert.equal(homonymWarningEnabled(false), false);
  });

  it("keeps family moves confirmable and same-family links closed", () => {
    const same = familyLinkDecision({
      people: [{ id: "p1", householdId: "h1" }],
      targetHouseholdId: "h1",
      confirmMove: true,
    });
    assert.equal(same.code, "FAMILY_LINK_EXISTS");
    assert.equal(same.blocking, true);
    const move = familyLinkDecision({
      people: [{ id: "p1", householdId: "h-other" }],
      targetHouseholdId: "h1",
      confirmMove: false,
    });
    assert.equal(move.code, "FAMILY_MOVE_REQUIRED");
    assert.deepEqual(move.existing, { id: "p1", status: "OTHER_HOUSEHOLD" });
    assert.equal(JSON.stringify(move).includes("h-other"), false);
    assert.equal(familyLinkDecision({
      people: [{ id: "p1", householdId: "h-other" }],
      targetHouseholdId: "h1",
      confirmMove: true,
    }).action, "allow");
  });

  it("does not let a schedule setting turn the conflict off", () => {
    assert.equal(scheduleMode("off"), "warn");
    assert.equal(scheduleMode("block"), "block");
    const missing = scheduleCommitDecision({ missingResponsible: true, mode: "off", acknowledge: true });
    assert.equal(missing.code, "SERVICE_ORDER_MISSING_RESPONSIBLE");
    assert.equal(missing.blocking, true);
    const warned = scheduleCommitDecision({ missingResponsible: false, conflictRosterId: "r1", mode: "off", acknowledge: false });
    assert.equal(warned.blocking, false);
    const blocked = scheduleCommitDecision({ missingResponsible: false, conflictRosterId: "r1", mode: "block", acknowledge: true });
    assert.equal(blocked.blocking, true);
    assert.equal(scheduleCommitDecision({ missingResponsible: false, conflictRosterId: "r1", mode: "warn", acknowledge: true }).action, "allow");
  });

  it("asks for a justification on a similar ledger entry and allows a reviewed one", () => {
    const candidate = { id: "e1", status: "DRAFT", description: "Dízimo", entryDate: "2026-11-23", amountCents: 10000 };
    const conflict = ledgerDuplicateDecision({ review: true, candidate, duplicateJustification: "curta" });
    assert.equal(conflict.code, "LEDGER_POSSIBLE_DUPLICATE");
    const allowed = ledgerDuplicateDecision({
      review: true,
      candidate,
      duplicateExistingId: "e1",
      duplicateJustification: "Oferta de outra pessoa no mesmo culto.",
    });
    assert.equal(allowed.action, "allow");
    assert.equal(ledgerDuplicateDecision({ review: false, candidate }).action, "allow");
  });

  it("keeps copy free of technical routes and document samples", () => {
    const blob = JSON.stringify(PREVENTIVE_COPY);
    assert.equal(/personId|POST \/|schema|P2002|alert\(/.test(blob), false);
    assert.equal(blob.includes(secret), false);
  });
});
