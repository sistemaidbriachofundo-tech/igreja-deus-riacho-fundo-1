import { describe, expect, it } from "vitest";
import { ApiRequestError } from "../lib/api";
import { receiptLoadErrorMessage } from "./expense-receipt-errors";

describe("Comprovantes da despesa: mensagens de erro sem vazar informações", () => {
  it("distingue autorização de arquivo ausente", () => {
    expect(receiptLoadErrorMessage(new ApiRequestError("x", 403, "forbidden"))).toContain("permissão");
    expect(receiptLoadErrorMessage(new ApiRequestError("x", 404, "http"))).toContain("não foi encontrado");
    expect(receiptLoadErrorMessage(new ApiRequestError("x", 401, "unauthorized"))).toContain("sessão expirou");
  });
  it("distingue falha de transporte de falha geral", () => {
    expect(receiptLoadErrorMessage(new ApiRequestError("x", null, "network"))).toContain("Sem conexão");
    expect(receiptLoadErrorMessage(new ApiRequestError("x", null, "timeout"))).toContain("demorou");
    expect(receiptLoadErrorMessage(new Error("credencial-secreta=xyz"))).not.toContain("xyz");
  });
});
