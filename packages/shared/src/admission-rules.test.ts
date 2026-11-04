import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertAdmissionStepAllowed,
  isCredentialEligible,
  nextAdmissionStep,
} from "./admission-rules";

describe("admission rules", () => {
  it("locks pastor until secretaria approved", () => {
    const result = assertAdmissionStepAllowed("pastor", {
      modalityRecorded: true,
      documentsComplete: true,
      secretariaApproved: false,
      pastorApproved: false,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "ADMISSION_STEP_LOCKED");
    }
  });

  it("allows pastor after secretaria", () => {
    const result = assertAdmissionStepAllowed("pastor", {
      modalityRecorded: true,
      documentsComplete: true,
      secretariaApproved: true,
      pastorApproved: false,
    });
    assert.equal(result.ok, true);
  });

  it("credentialEligible only when APPROVED", () => {
    assert.equal(isCredentialEligible("APPROVED"), true);
    assert.equal(isCredentialEligible("AWAITING_PASTOR"), false);
  });

  it("advances steps in order", () => {
    assert.equal(nextAdmissionStep("modality"), "documents");
    assert.equal(nextAdmissionStep("documents"), "secretaria");
    assert.equal(nextAdmissionStep("secretaria"), "pastor");
    assert.equal(nextAdmissionStep("pastor"), "pastor");
  });
});
