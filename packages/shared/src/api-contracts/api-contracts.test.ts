import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ADMISSION_STEP_ORDER,
  ADMISSION_STATUSES,
  API_CONTRACT_VERSION,
  API_ENDPOINT_STATUS,
  MEMBERSHIP_STATUSES,
} from "./index";

describe("api contracts F2", () => {
  it("pins contract version for FE/BE sync", () => {
    assert.equal(API_CONTRACT_VERSION, "0.2.0-f2");
  });

  it("keeps admission checklist order (no skipping)", () => {
    assert.deepEqual([...ADMISSION_STEP_ORDER], [
      "modality",
      "documents",
      "secretaria",
      "pastor",
    ]);
  });

  it("requires pastor approval status before APPROVED", () => {
    assert.ok(ADMISSION_STATUSES.AWAITING_PASTOR);
    assert.ok(ADMISSION_STATUSES.APPROVED);
    assert.notEqual(
      ADMISSION_STATUSES.AWAITING_SECRETARIA,
      ADMISSION_STATUSES.APPROVED,
    );
  });

  it("adds PENDING_ADMISSION without removing ACTIVE", () => {
    assert.equal(MEMBERSHIP_STATUSES.PENDING_ADMISSION, "PENDING_ADMISSION");
    assert.equal(MEMBERSHIP_STATUSES.ACTIVE, "ACTIVE");
  });

  it("marks F2 admissions and person endpoints as implemented", () => {
    assert.equal(API_ENDPOINT_STATUS["POST /admissions"], "implemented");
    assert.equal(API_ENDPOINT_STATUS["GET /persons/search"], "implemented");
    assert.equal(API_ENDPOINT_STATUS["POST /auth/login"], "implemented");
    assert.equal(
      API_ENDPOINT_STATUS["POST /credentials/issue/:membershipId"],
      "implemented",
    );
    assert.equal(
      API_ENDPOINT_STATUS["POST /credentials/reissue/:membershipId"],
      "implemented",
    );
  });
});
