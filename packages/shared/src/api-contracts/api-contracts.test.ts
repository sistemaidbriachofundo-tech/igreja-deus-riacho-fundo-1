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
    assert.equal(API_CONTRACT_VERSION, "0.6.0-f4");
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
    assert.equal(
      API_ENDPOINT_STATUS["GET /persons/:personId/dossier"],
      "implemented",
    );
    assert.equal(
      API_ENDPOINT_STATUS["POST /admissions/:admissionId/documents"],
      "implemented",
    );
    assert.equal(API_ENDPOINT_STATUS["GET /meta"], "implemented");
    assert.equal(API_ENDPOINT_STATUS["GET /audit-logs"], "implemented");
    assert.equal(API_ENDPOINT_STATUS["GET /households"], "implemented");
    assert.equal(API_ENDPOINT_STATUS["POST /transfers"], "implemented");
    assert.equal(API_ENDPOINT_STATUS["POST /pastoral-cases"], "implemented");
    assert.equal(API_ENDPOINT_STATUS["POST /rosters"], "implemented");
    assert.equal(
      API_ENDPOINT_STATUS["PATCH /pastoral-cases/:caseId/tasks/:taskId"],
      "implemented",
    );
    assert.equal(
      API_ENDPOINT_STATUS["POST /assignments/:assignmentId/substitute"],
      "implemented",
    );
    assert.equal(
      API_ENDPOINT_STATUS["POST /small-groups/:groupId/meetings"],
      "implemented",
    );
    assert.equal(API_ENDPOINT_STATUS["GET /public/ministries"], "implemented");
    assert.equal(API_ENDPOINT_STATUS["GET /public/events"], "implemented");
    assert.equal(API_ENDPOINT_STATUS["GET /public/home"], "implemented");
    assert.equal(API_ENDPOINT_STATUS["POST /events"], "implemented");
    assert.equal(
      API_ENDPOINT_STATUS["PATCH /ministries/:ministryId"],
      "implemented",
    );
    assert.equal(
      API_ENDPOINT_STATUS["GET /public/content/:slug"],
      "implemented",
    );
    assert.equal(
      API_ENDPOINT_STATUS["POST /public/volunteer-interests"],
      "implemented",
    );
    assert.equal(API_ENDPOINT_STATUS["POST /cms/contents"], "implemented");
    assert.equal(
      API_ENDPOINT_STATUS["PATCH /volunteer-interests/:interestId"],
      "implemented",
    );
    assert.equal(
      API_ENDPOINT_STATUS["POST /credentials/:credentialId/pdf"],
      "implemented",
    );
    assert.equal(API_ENDPOINT_STATUS["GET /auth/mfa/status"], "implemented");
    assert.equal(API_ENDPOINT_STATUS["GET /auth/oidc/config"], "implemented");
    assert.equal(API_ENDPOINT_STATUS["GET /auth/oidc/authorize"], "implemented");
    assert.equal(API_ENDPOINT_STATUS["POST /ledger/accounts"], "implemented");
    assert.equal(API_ENDPOINT_STATUS["POST /ledger/entries"], "implemented");
    assert.equal(
      API_ENDPOINT_STATUS["POST /ledger/entries/:entryId/approve"],
      "implemented",
    );
    assert.equal(API_ENDPOINT_STATUS["POST /ledger/imports"], "implemented");
    assert.equal(
      API_ENDPOINT_STATUS["POST /ledger/reconciliations"],
      "implemented",
    );
  });
});
