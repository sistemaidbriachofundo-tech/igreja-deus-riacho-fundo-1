import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EventRegistrations, paymentLabel, registrationTitle } from "./EventRegistrations";

describe("inscrições sem dados de menor nem jargão", () => {
  it("omite o menor e traduz o pagamento interno", () => {
    expect(registrationTitle({ isMinor: true, displayName: "TESTE Menor" })).toBe("Registro de menor omitido");
    expect(registrationTitle({ displayName: "TESTE Adulto" })).toBe("TESTE Adulto");
    expect(paymentLabel("CONFIRMED_MOCK")).toBe("Confirmado na homologação");
    expect(paymentLabel("CONFIRMED_MOCK")).not.toContain("MOCK");
  });

  it("a tela fechada não revela contato nem finge envio", () => {
    const html = renderToStaticMarkup(<EventRegistrations events={[{
      id: "event-1", name: "Culto", status: "PUBLISHED", participantEmail: "pessoa@example.test",
    }]} token="token-falso" />);
    expect(html).toContain("Operação do evento");
    expect(html).toContain("Selecione um evento");
    expect(html).toContain("Sem cobrança real");
    expect(html).not.toContain("pessoa@example.test");
    expect(html).not.toContain("MOCK");
    expect(html).not.toMatch(/\bAPI\b|\bdemo\b|501/);
  });
});
