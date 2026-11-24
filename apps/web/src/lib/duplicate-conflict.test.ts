import { describe, expect, it } from "vitest";
import { ApiRequestError } from "./api";
import { readDuplicateConflict } from "./duplicate-conflict";
const conflict = (value: unknown, status = 409) => new ApiRequestError(JSON.stringify(value), status, "http");
describe("structured UX conflicts", () => {
  it("recognizes event recovery without including ticket data", () => {
    expect(readDuplicateConflict(conflict({ code: "EVENT_REGISTRATION_DUPLICATE", existing: { id: "r1", status: "PENDING_PAYMENT", checkInCode: "private" } }))).toEqual({
      code: "EVENT_REGISTRATION_DUPLICATE", existing: { id: "r1", status: "PENDING_PAYMENT" },
    });
  });
  it("preserves the difference between confirmed and possible finance conflicts", () => {
    for (const code of ["LEDGER_POSSIBLE_DUPLICATE", "LEDGER_DUPLICATE_CONFIRMED"]) {
      const existing = { id: "e1", status: "PENDING_APPROVAL", description: "Energia", entryDate: "2026-11-23", amountCents: 85000 };
      expect(readDuplicateConflict(conflict({ code, existing }))).toEqual({ code, existing });
    }
  });
  it("does not mistake authorization failures, capacity or malformed errors for duplicates", () => {
    const value = { code: "EVENT_REGISTRATION_DUPLICATE", existing: { id: "r1", status: "CONFIRMED" } };
    expect(readDuplicateConflict(conflict(value, 403))).toBeNull();
    expect(readDuplicateConflict(conflict({ message: "capacidade esgotada" }))).toBeNull();
    expect(readDuplicateConflict(conflict({ ...value, existing: {} }))).toBeNull();
    expect(readDuplicateConflict(new Error("duplicate"))).toBeNull();
  });
});
