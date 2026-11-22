import { describe, expect, it } from "vitest";
import { ApiRequestError } from "./api";
import { RECEIPT_EMPTY, receiptFeedback } from "./receipt-feedback";

describe("comprovantes", () => {
  it("distingue 403, 404, tempo, rede e lista vazia sem esconder o status", () => {
    expect(receiptFeedback(new ApiRequestError("negado", 403, "forbidden"))).toContain("403");
    expect(receiptFeedback(new ApiRequestError("ausente", 404, "http"))).toContain("404");
    expect(receiptFeedback(new ApiRequestError("lento", null, "timeout"))).toMatch(/tempo/i);
    expect(receiptFeedback(new ApiRequestError("offline", null, "network"), "download")).toMatch(/conexão/i);
    expect(receiptFeedback(new ApiRequestError("falha", 500, "http"))).toContain("500");
    expect(RECEIPT_EMPTY).toBe("Nenhum comprovante anexado.");
  });
});
