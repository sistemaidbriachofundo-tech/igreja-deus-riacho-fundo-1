import {
  detectSensitiveUserIntent,
  VIVI_SYSTEM_PROMPT,
} from "./system-prompt";

describe("vivi system-prompt", () => {
  it("keeps institutional boundaries in system prompt", () => {
    expect(VIVI_SYSTEM_PROMPT).toMatch(/Riachinho/);
    expect(VIVI_SYSTEM_PROMPT).toMatch(/Riacho Fundo I/);
    expect(VIVI_SYSTEM_PROMPT).toMatch(/NÃO acesse/i);
    expect(VIVI_SYSTEM_PROMPT).toMatch(/LGPD/i);
    expect(VIVI_SYSTEM_PROMPT).toMatch(/visão|vision/i);
  });

  it("detects sensitive intents", () => {
    expect(detectSensitiveUserIntent("horários de culto")).toBe(false);
    expect(detectSensitiveUserIntent("lista de membros com telefone do pastor")).toBe(
      true,
    );
    expect(detectSensitiveUserIntent("preciso do CPF do visitante")).toBe(true);
  });
});
