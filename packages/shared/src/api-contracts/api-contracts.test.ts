import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ADMISSION_STEP_ORDER,
  ADMISSION_STATUSES,
  API_CONTRACT_VERSION,
  API_ENDPOINT_STATUS,
  MEMBERSHIP_STATUSES,
} from "./index";

describe("api contracts F2", () => {
  it("pins contract version for FE/BE sync", () => {
    assert.equal(API_CONTRACT_VERSION, "0.7.3-das-etapa3");
  });

  it("keeps OpenAPI info.version in sync with API_CONTRACT_VERSION", () => {
    // `npm test -w @idbrf/shared` roda com cwd = packages/shared
    const yaml = readFileSync(join(process.cwd(), "openapi/f2-v0.2.yaml"), "utf8");
    assert.match(yaml, new RegExp(`^  version: ${API_CONTRACT_VERSION}$`, "m"));
  });

  it("marks zero endpoints as proposed (F2 surface closed)", () => {
    const proposed = Object.entries(API_ENDPOINT_STATUS).filter(
      ([, status]) => (status as string) === "proposed",
    );
    assert.deepEqual(proposed, []);
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
    assert.ok(ADMISSION_STATUSES.CANCELLED);
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
    assert.equal(API_ENDPOINT_STATUS["POST /persons/candidates"], "implemented");
    assert.equal(API_ENDPOINT_STATUS["POST /letters/:letterId/pdf"], "implemented");
    assert.equal(API_ENDPOINT_STATUS["GET /letters/:letterId/pdf"], "implemented");
    assert.equal(API_ENDPOINT_STATUS["GET /letters/:letterId/pdf-meta"], "implemented");
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
    assert.equal(
      API_ENDPOINT_STATUS["DELETE /admissions/:admissionId/documents/:documentId"],
      "implemented",
    );
    assert.equal(
      API_ENDPOINT_STATUS["POST /admissions/:admissionId/cancel"],
      "implemented",
    );
    assert.equal(API_ENDPOINT_STATUS["GET /meta"], "implemented");
    assert.equal(API_ENDPOINT_STATUS["GET /audit-logs"], "implemented");
    assert.equal(API_ENDPOINT_STATUS["GET /households"], "implemented");
    assert.equal(API_ENDPOINT_STATUS["POST /transfers"], "implemented");
    assert.equal(API_ENDPOINT_STATUS["POST /pastoral-cases"], "implemented");
    assert.equal(API_ENDPOINT_STATUS["POST /rosters"], "implemented");
    assert.equal(
      API_ENDPOINT_STATUS["POST /rosters/:rosterId/publish"],
      "implemented",
    );
    assert.equal(
      API_ENDPOINT_STATUS["POST /rosters/:rosterId/close"],
      "implemented",
    );
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
    assert.equal(
      API_ENDPOINT_STATUS["GET /discipleship/tracks/:trackId/stages"],
      "implemented",
    );
    assert.equal(
      API_ENDPOINT_STATUS["POST /discipleship/enrollments/:enrollmentId/progress"],
      "implemented",
    );
    assert.equal(
      API_ENDPOINT_STATUS["GET /small-groups/frequency-report"],
      "implemented",
    );
    assert.equal(API_ENDPOINT_STATUS["GET /public/ministries"], "implemented");
    assert.equal(API_ENDPOINT_STATUS["GET /public/events"], "implemented");
    assert.equal(API_ENDPOINT_STATUS["GET /public/home"], "implemented");
    assert.equal(API_ENDPOINT_STATUS["POST /events"], "implemented");
    assert.equal(
      API_ENDPOINT_STATUS["POST /events/:eventId/modalities"],
      "implemented",
    );
    assert.equal(
      API_ENDPOINT_STATUS["POST /events/:eventId/lots"],
      "implemented",
    );
    assert.equal(
      API_ENDPOINT_STATUS["POST /events/:eventId/registrations"],
      "implemented",
    );
    assert.equal(
      API_ENDPOINT_STATUS["POST /registrations/:registrationId/check-in"],
      "implemented",
    );
    assert.equal(
      API_ENDPOINT_STATUS["POST /webhooks/event-payments/mock"],
      "implemented",
    );
    assert.equal(
      API_ENDPOINT_STATUS["POST /public/events/:slug/registrations"],
      "implemented",
    );
    assert.equal(
      API_ENDPOINT_STATUS["GET /public/registrations/:checkInCode"],
      "implemented",
    );
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
    assert.equal(
      API_ENDPOINT_STATUS["POST /ledger/bank-lines/:lineId/match"],
      "implemented",
    );
    assert.equal(
      API_ENDPOINT_STATUS["POST /ledger/bank-lines/:lineId/unmatch"],
      "implemented",
    );

    assert.equal(API_ENDPOINT_STATUS["GET /channels/providers"], "implemented");
    assert.equal(API_ENDPOINT_STATUS["GET /channels/rate-limits"], "implemented");
    assert.equal(API_ENDPOINT_STATUS["GET /channels/templates"], "implemented");
    assert.equal(API_ENDPOINT_STATUS["POST /channels/templates"], "implemented");
    assert.equal(API_ENDPOINT_STATUS["PATCH /channels/templates/:templateId"], "implemented");
    assert.equal(API_ENDPOINT_STATUS["GET /channels/consents/:personId"], "implemented");
    assert.equal(API_ENDPOINT_STATUS["PUT /channels/consents/:personId"], "implemented");
    assert.equal(API_ENDPOINT_STATUS["GET /channels/outbox"], "implemented");
    assert.equal(API_ENDPOINT_STATUS["POST /channels/outbox"], "implemented");
    assert.equal(API_ENDPOINT_STATUS["GET /channels/outbox/:outboxId"], "implemented");
    assert.equal(API_ENDPOINT_STATUS["POST /channels/outbox/:outboxId/dispatch"], "implemented");
    assert.equal(API_ENDPOINT_STATUS["POST /channels/outbox/dispatch-pending"], "implemented");
    assert.equal(API_ENDPOINT_STATUS["POST /auth/refresh"], "implemented");
    assert.equal(API_ENDPOINT_STATUS["POST /auth/switch-church"], "implemented");
    assert.equal(API_ENDPOINT_STATUS["GET /churches"], "implemented");
    assert.equal(API_ENDPOINT_STATUS["GET /indicators/summary"], "implemented");
    assert.equal(API_ENDPOINT_STATUS["GET /indicators/membership"], "implemented");
    assert.equal(API_ENDPOINT_STATUS["GET /vivi/status"], "implemented");
    assert.equal(API_ENDPOINT_STATUS["POST /public/vivi/chat"], "implemented");
    assert.equal(API_ENDPOINT_STATUS["POST /vivi/chat"], "implemented");
    assert.equal(API_ENDPOINT_STATUS["GET /pastoral-cases/retention-policy"], "implemented");
    assert.equal(API_ENDPOINT_STATUS["PUT /pastoral-cases/retention-policy"], "implemented");
    assert.equal(API_ENDPOINT_STATUS["POST /pastoral-cases/retention/apply"], "implemented");
    assert.equal(API_ENDPOINT_STATUS["POST /pastoral-cases/export"], "implemented");
    assert.equal(API_ENDPOINT_STATUS["POST /courses"], "implemented");
    assert.equal(API_ENDPOINT_STATUS["POST /courses/classes/:classId/enrollments"], "implemented");
    assert.equal(API_ENDPOINT_STATUS["POST /courses/enrollments/:enrollmentId/complete"], "implemented");
    assert.equal(API_ENDPOINT_STATUS["POST /courses/classes/:classId/sessions"], "implemented");
    assert.equal(API_ENDPOINT_STATUS["POST /assets"], "implemented");
    assert.equal(API_ENDPOINT_STATUS["PATCH /assets/:assetId"], "implemented");
    assert.equal(API_ENDPOINT_STATUS["GET /assets/:assetId/history"], "implemented");
  });
});
