import { describe, expect, it } from "vitest";
import { ruleState } from "../lib/system-rules-state";

const base = { key: "k", title: "Título", description: "Texto", valueType: "boolean", scopeKind: "CHURCH", devValue: true };

describe("rótulo da regra do sistema", () => {
  it("não apresenta regra documental ou bloqueada como vigência ativa", () => {
    expect(ruleState({ ...base, behavior: "documentary" })).toMatch(/não altera o sistema/);
    expect(ruleState({ ...base, behavior: "locked" })).toMatch(/Bloqueio de segurança/);
    expect(ruleState({ ...base, editable: false })).toMatch(/não altera o sistema/);
    expect(ruleState({ ...base, behavior: "active", editable: true })).toBe("Em vigor");
  });
});
