import { MetaController } from "./meta.controller";
import { API_CONTRACT_VERSION } from "@idbrf/shared";

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
    expect(meta.notes.some((n) => n.includes("0.7.4-rf025"))).toBe(true);
    expect(meta.notes.some((n) => n.includes("RF-020/021"))).toBe(true);
    expect(meta.notes.some((n) => n.includes("RF-029"))).toBe(true);
    expect(meta.notes.some((n) => n.includes("RF-023"))).toBe(true);
    expect(meta.endpoints["POST /channels/device-tokens"]).toBe("implemented");
    expect(meta.endpoints["GET /channels/consents/me"]).toBe("implemented");
    expect(meta.endpoints["POST /channels/outbox/push-fanout"]).toBe(
      "implemented",
    );
    expect(meta.endpoints["POST /persons/candidates"]).toBe("implemented");
    expect(meta.endpoints["POST /letters/:letterId/pdf"]).toBe("implemented");
    expect(meta.endpoints["POST /events/:eventId/registrations"]).toBe(
      "implemented",
    );
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
  });
});
