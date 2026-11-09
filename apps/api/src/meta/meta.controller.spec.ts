import { MetaController } from "./meta.controller";
import { API_CONTRACT_VERSION } from "@idbrf/shared";

const SHA = "ca00a4fd2c5d1f87cca815c3822a35cb9a92c3c2";

describe("MetaController", () => {
  it("exposes contract version for FE", () => {
    const meta = new MetaController().getMeta();
    expect(meta.contractVersion).toBe(API_CONTRACT_VERSION);
    expect(meta.endpoints["GET /meta"]).toBe("implemented");
    expect(meta.endpoints["POST /public/vivi/chat"]).toBe("implemented");
    expect(meta.pilot).toBe(true);
    expect(meta.notes.some((n) => n.includes("0.7.1-vivi"))).toBe(true);
    expect(meta.notes.some((n) => n.includes("0.7.2-f2"))).toBe(true);
    expect(meta.notes.some((n) => n.includes("0.7.3-das-etapa3"))).toBe(true);
    expect(meta.notes.some((n) => n.includes("0.7.4-rf014"))).toBe(true);
    expect(meta.notes.some((n) => n.includes("0.7.4-rf022"))).toBe(true);
    expect(meta.notes.some((n) => n.includes("0.7.4-rf025"))).toBe(true);
    expect(meta.notes.some((n) => n.includes("RF-020/021"))).toBe(true);
    expect(meta.notes.some((n) => n.includes("RF-029"))).toBe(true);
    expect(meta.notes.some((n) => n.includes("RF-023"))).toBe(true);
    expect(meta.notes.some((n) => n.includes("RF-016"))).toBe(true);
    expect(meta.notes.some((n) => n.includes("RF-014"))).toBe(true);
    expect(meta.endpoints["POST /channels/device-tokens"]).toBe("implemented");
    expect(meta.endpoints["POST /persons/candidates"]).toBe("implemented");
    expect(meta.endpoints["POST /letters/:letterId/pdf"]).toBe("implemented");
    expect(meta.endpoints["POST /events/:eventId/registrations"]).toBe(
      "implemented",
    );
    expect(meta.endpoints["POST /events/:eventId/lodging-options"]).toBe(
      "implemented",
    );
    expect(
      meta.endpoints["POST /registrations/:registrationId/guardian-authorization"],
    ).toBe("implemented");
    expect(meta.endpoints["POST /webhooks/event-payments/mock"]).toBe(
      "implemented",
    );
    expect(meta.endpoints["POST /admissions/:admissionId/cancel"]).toBe(
      "implemented",
    );
    expect(
      meta.endpoints["DELETE /admissions/:admissionId/documents/:documentId"],
    ).toBe("implemented");
    expect(
      meta.endpoints["POST /discipleship/enrollments/:enrollmentId/progress"],
    ).toBe("implemented");
    expect(meta.endpoints["GET /small-groups/frequency-report"]).toBe(
      "implemented",
    );
    expect(meta.endpoints["GET /indicators/summary"]).toBe("implemented");
    expect(meta.endpoints["GET /indicators/membership"]).toBe("implemented");
    expect(meta.endpoints["POST /courses"]).toBe("implemented");
    expect(meta.endpoints["POST /pastoral-cases/export"]).toBe("implemented");
    expect(meta.endpoints["POST /assets"]).toBe("implemented");
    expect(meta.endpoints["POST /ledger/funds"]).toBe("implemented");
    expect(meta.endpoints["POST /ledger/budgets"]).toBe("implemented");
    expect(meta.endpoints["POST /volunteer-availabilities"]).toBe(
      "implemented",
    );
    expect(
      meta.endpoints["POST /roster-couple-exceptions/simulate"],
    ).toBe("implemented");
    expect(meta.endpoints["POST /channels/outbox/resend"]).toBe("implemented");
    expect(meta.notes.some((note) => note.includes("sourceSha"))).toBe(true);
    const previousSource = process.env.SOURCE_SHA;
    const previousVercel = process.env.VERCEL_GIT_COMMIT_SHA;
    delete process.env.SOURCE_SHA;
    delete process.env.VERCEL_GIT_COMMIT_SHA;
    expect(new MetaController().getMeta().sourceSha).toBeNull();
    if (previousSource === undefined) delete process.env.SOURCE_SHA;
    else process.env.SOURCE_SHA = previousSource;
    if (previousVercel === undefined) delete process.env.VERCEL_GIT_COMMIT_SHA;
    else process.env.VERCEL_GIT_COMMIT_SHA = previousVercel;
  });

  it("publica só um SHA completo vindo do deploy", () => {
    const previousSource = process.env.SOURCE_SHA;
    const previousVercel = process.env.VERCEL_GIT_COMMIT_SHA;
    const previousGithub = process.env.GITHUB_SHA;
    process.env.SOURCE_SHA = SHA;
    process.env.GITHUB_SHA = "b".repeat(40);
    expect(new MetaController().getMeta().sourceSha).toBe(SHA);
    delete process.env.SOURCE_SHA;
    process.env.VERCEL_GIT_COMMIT_SHA = "c".repeat(40);
    expect(new MetaController().getMeta().sourceSha).toBe("c".repeat(40));
    process.env.VERCEL_GIT_COMMIT_SHA = "curto";
    expect(new MetaController().getMeta().sourceSha).toBeNull();
    if (previousSource === undefined) delete process.env.SOURCE_SHA;
    else process.env.SOURCE_SHA = previousSource;
    if (previousVercel === undefined) delete process.env.VERCEL_GIT_COMMIT_SHA;
    else process.env.VERCEL_GIT_COMMIT_SHA = previousVercel;
    if (previousGithub === undefined) delete process.env.GITHUB_SHA;
    else process.env.GITHUB_SHA = previousGithub;
  });
});
