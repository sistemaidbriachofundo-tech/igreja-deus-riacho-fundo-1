import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertAdmissionStepAllowed,
  isCredentialEligible,
  missingRequiredAdmissionDocuments,
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

  it("blocks only configured mandatory documents", () => {
    assert.deepEqual(missingRequiredAdmissionDocuments([], ["legacy"]), []);
    assert.deepEqual(
      missingRequiredAdmissionDocuments(
        [
          { id: "opt", label: "Opcional", required: false, active: true },
          { id: "off", label: "Inativo", required: true, active: false },
        ],
        [],
      ),
      [],
    );
    assert.deepEqual(
      missingRequiredAdmissionDocuments(
        [{ id: "req", label: "Documento fictício", required: true, active: true }],
        [null, "outro"],
      ),
      [{ id: "req", label: "Documento fictício" }],
    );
    assert.deepEqual(
      missingRequiredAdmissionDocuments(
        [{ id: "req", label: "Documento fictício", required: true, active: true }],
        ["req"],
      ),
      [],
    );
  });

  it("advances steps in order", () => {
    assert.equal(nextAdmissionStep("modality"), "documents");
    assert.equal(nextAdmissionStep("documents"), "secretaria");
    assert.equal(nextAdmissionStep("secretaria"), "pastor");
    assert.equal(nextAdmissionStep("pastor"), "pastor");
  });
});
