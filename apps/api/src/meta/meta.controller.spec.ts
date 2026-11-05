import { MetaController } from "./meta.controller";
import { API_CONTRACT_VERSION } from "@idbrf/shared";

describe("MetaController", () => {
  it("exposes contract version for FE", () => {
    const meta = new MetaController().getMeta();
    expect(meta.contractVersion).toBe(API_CONTRACT_VERSION);
    expect(meta.endpoints["GET /meta"]).toBe("implemented");
    expect(meta.pilot).toBe(true);
  });
});
