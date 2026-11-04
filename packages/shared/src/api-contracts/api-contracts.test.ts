import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  ADMISSION_STEP_ORDER,
  ADMISSION_STATUSES,
  API_CONTRACT_VERSION,
  API_ENDPOINT_STATUS,
  API_PATH_PREFIX,
  MEMBERSHIP_STATUSES,
  MOCK_ADMISSION_APPROVED,
  joinApiPath,
} from "./index";

describe("api contracts F2", () => {
  it("pins contract version for FE/BE sync", () => {
    assert.equal(API_CONTRACT_VERSION, "0.3.0-f2");
  });

  it("uses an empty path prefix so Nest root routes stay correct", () => {
    assert.equal(API_PATH_PREFIX, "");
    assert.equal(
      joinApiPath("http://localhost:3001", "/auth/login"),
      "http://localhost:3001/auth/login",
    );
    assert.equal(
      joinApiPath("http://localhost:3001/", "/memberships"),
      "http://localhost:3001/memberships",
    );
    assert.equal(
      joinApiPath("http://localhost:3001", "/admissions"),
      "http://localhost:3001/admissions",
    );
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

  it("marks admissions as implemented and persons/households as proposed", () => {
    assert.equal(API_ENDPOINT_STATUS["POST /admissions"], "implemented");
    assert.equal(API_ENDPOINT_STATUS["GET /admissions"], "implemented");
    assert.equal(
      API_ENDPOINT_STATUS["GET /admissions/:admissionId"],
      "implemented",
    );
    assert.equal(
      API_ENDPOINT_STATUS["POST /admissions/:admissionId/advance"],
      "implemented",
    );
    assert.equal(API_ENDPOINT_STATUS["POST /auth/login"], "implemented");
    assert.equal(
      API_ENDPOINT_STATUS["POST /credentials/issue/:membershipId"],
      "implemented",
    );
    assert.equal(API_ENDPOINT_STATUS["GET /persons/search"], "proposed");
    assert.equal(API_ENDPOINT_STATUS["GET /persons/:personId"], "proposed");
    assert.equal(API_ENDPOINT_STATUS["POST /households"], "proposed");
    assert.equal(API_ENDPOINT_STATUS["GET /households/:householdId"], "proposed");
  });

  it("keeps credentialEligible false until pastoral approval", () => {
    assert.equal(MOCK_ADMISSION_APPROVED.credentialEligible, true);
    assert.equal(MOCK_ADMISSION_APPROVED.checklist.pastorApproved, true);
  });

  it("OpenAPI paths match the empty prefix and admission status", () => {
    const yaml = readFileSync(
      path.join(process.cwd(), "openapi/f2-v0.3.yaml"),
      "utf8",
    );
    assert.match(yaml, /version: 0\.3\.0-f2/);
    assert.match(yaml, /x-path-prefix: ""/);
    assert.equal(yaml.includes("/api/auth"), false);
    const admissions = yaml.slice(yaml.indexOf("  /admissions:"));
    assert.equal(admissions.includes("x-implementation: proposed"), false);
    assert.equal(
      admissions.match(/x-implementation: implemented/g)?.length,
      4,
    );
    const beforeAdmissions = yaml.slice(0, yaml.indexOf("  /admissions:"));
    assert.ok(beforeAdmissions.includes("x-implementation: proposed"));
  });
});
