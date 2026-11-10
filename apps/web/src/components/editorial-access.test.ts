import { describe, expect, it } from "vitest";
import { advanceOptions, mayPublishRecord } from "./editorial-access";

describe("autorização do estúdio", () => {
  it("editor não aprova nem publica", () => {
    expect(advanceOptions("RASCUNHO", false)).toEqual(["REVISAO", "ARQUIVADO"]);
    expect(advanceOptions("REVISAO", false)).toEqual(["RASCUNHO", "ARQUIVADO"]);
    expect(advanceOptions("APROVADO", false)).toEqual(["REVISAO", "ARQUIVADO"]);
    expect(advanceOptions("PUBLICADO", false)).toEqual([]);
    expect(mayPublishRecord(false, "DRAFT")).toBe(false);
    expect(mayPublishRecord(false, "PUBLISHED")).toBe(false);
  });

  it("publicador aprova e coloca no ar", () => {
    expect(advanceOptions("REVISAO", true)).toEqual(["RASCUNHO", "APROVADO", "ARQUIVADO"]);
    expect(advanceOptions("APROVADO", true)).toContain("PUBLICADO");
    expect(advanceOptions("PUBLICADO", true)).toEqual(["REVISAO", "ARQUIVADO"]);
    expect(mayPublishRecord(true, "DRAFT")).toBe(true);
    expect(mayPublishRecord(true, "PUBLISHED")).toBe(false);
    expect(mayPublishRecord(true, "PUBLICADO")).toBe(false);
  });
});
