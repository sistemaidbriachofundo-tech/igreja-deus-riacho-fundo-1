import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ADMISSION_TERMINAL_STATUSES,
  PASTOR_LIST_STATUSES,
  admissionCurrentStep,
  canAdvanceAdmissionStep,
  canOpenAdmission,
  canReviewPastoralQueue,
  credentialEligible,
  isAdmissionStep,
} from "./admission";
import { ROLE_CODES } from "./rbac";

const target = { organizationId: "org1", churchId: "church-rf1" };

describe("admission steps", () => {
  it("walks modality → documents → secretaria → pastor", () => {
    assert.equal(
      admissionCurrentStep({
        modalityRecorded: false,
        documentsComplete: false,
        secretariaApproved: false,
        pastorApproved: false,
      }),
      "modality",
    );
    assert.equal(
      admissionCurrentStep({
        modalityRecorded: true,
        documentsComplete: false,
        secretariaApproved: false,
        pastorApproved: false,
      }),
      "documents",
    );
    assert.equal(
      admissionCurrentStep({
        modalityRecorded: true,
        documentsComplete: true,
        secretariaApproved: false,
        pastorApproved: false,
      }),
      "secretaria",
    );
    assert.equal(
      admissionCurrentStep({
        modalityRecorded: true,
        documentsComplete: true,
        secretariaApproved: true,
        pastorApproved: true,
      }),
      "pastor",
    );
  });

  it("rejects unknown steps", () => {
    assert.equal(isAdmissionStep("pastor"), true);
    assert.equal(isAdmissionStep("acolhimento"), false);
  });

  it("credentialEligible requires APPROVED + ACTIVE + pastor", () => {
    assert.equal(
      credentialEligible({
        admissionStatus: "APPROVED",
        membershipStatus: "ACTIVE",
        pastorApproved: true,
      }),
      true,
    );
    assert.equal(
      credentialEligible({
        admissionStatus: "APPROVED",
        membershipStatus: "PENDING_ADMISSION",
        pastorApproved: true,
      }),
      false,
    );
    assert.equal(
      credentialEligible({
        admissionStatus: "AWAITING_PASTOR",
        membershipStatus: "ACTIVE",
        pastorApproved: false,
      }),
      false,
    );
    assert.equal(
      credentialEligible({
        admissionStatus: "REJECTED",
        membershipStatus: "ACTIVE",
        pastorApproved: false,
      }),
      false,
    );
  });

  it("secretaria cannot complete the pastor step", () => {
    const grants = [
      {
        roleCode: ROLE_CODES.SECRETARIA,
        organizationId: target.organizationId,
        churchId: target.churchId,
      },
    ];
    assert.equal(canAdvanceAdmissionStep(grants, "documents", target), true);
    assert.equal(canAdvanceAdmissionStep(grants, "pastor", target), false);
    assert.equal(canOpenAdmission(grants, target), true);
    assert.equal(canReviewPastoralQueue(grants, target), false);
  });

  it("pastor cannot open or complete secretaria steps", () => {
    const grants = [
      {
        roleCode: ROLE_CODES.PASTOR,
        organizationId: target.organizationId,
        churchId: target.churchId,
      },
    ];
    assert.equal(canOpenAdmission(grants, target), false);
    assert.equal(canAdvanceAdmissionStep(grants, "documents", target), false);
    assert.equal(canAdvanceAdmissionStep(grants, "pastor", target), true);
    assert.equal(canReviewPastoralQueue(grants, target), true);
  });

  it("denies another congregation", () => {
    const grants = [
      {
        roleCode: ROLE_CODES.SECRETARIA,
        organizationId: target.organizationId,
        churchId: "church-other",
      },
    ];
    assert.equal(canOpenAdmission(grants, target), false);
    assert.equal(canAdvanceAdmissionStep(grants, "modality", target), false);
  });

  it("reserves terminal and pastoral list statuses", () => {
    assert.ok(ADMISSION_TERMINAL_STATUSES.includes("APPROVED"));
    assert.deepEqual([...PASTOR_LIST_STATUSES], [
      "AWAITING_PASTOR",
      "APPROVED",
      "REJECTED",
    ]);
  });
});
