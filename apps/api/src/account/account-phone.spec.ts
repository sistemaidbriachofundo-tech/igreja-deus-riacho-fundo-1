import { BusinessException } from "../common/business.exception";
import { normalizeAccountPhone } from "./account-phone";

describe("telefone de Minha Conta", () => {
  it("aceita o formato do cadastro e devolve o número canônico", () => {
    expect(normalizeAccountPhone("(61) 99999-0000")).toBe("+5561999990000");
    expect(normalizeAccountPhone("+55 61 3333-4444")).toBe("+556133334444");
    expect(normalizeAccountPhone(null)).toBeNull();
  });

  it("recusa texto, CPF solto e número sem DDD", () => {
    for (const value of ["telefone", "1234", "00000000000", "61 9999"]) {
      expect(() => normalizeAccountPhone(value)).toThrow(BusinessException);
    }
  });
});
