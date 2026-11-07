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
    expect(meta.notes.some((n) => n.includes("0.7.3-das-etapa3"))).toBe(true);
    expect(meta.endpoints["POST /admissions/:admissionId/cancel"]).toBe(
      "implemented",
    );
    expect(
      meta.endpoints["DELETE /admissions/:admissionId/documents/:documentId"],
    ).toBe("implemented");
  });
});
