import { describe, expect, it } from "vitest";
import { availableEventLots, eventAuthHref, parseRegistrationCatalog, registerForEvent, validRegistrationCode } from "./public-event-registration";
import { authenticatedLanding } from "./auth-destination";
import type { LoginResult } from "./api";

describe("inscrição pública", () => {
  it("omite lotes pagos simulados e mantém o Pix da igreja e a inscrição gratuita", () => {
    const catalog = parseRegistrationCatalog({
      id: "event", name: "Encontro", slug: "encontro", startsAt: "2026-11-20T19:00:00.000Z",
      modalities: [{ id: "individual", name: "Individual", minPartySize: 1, maxPartySize: 1 }],
      lots: [
        { id: "mock", name: "Simulado", priceCents: 2000, paymentMode: "MOCK_ONLY" },
        { id: "pix", name: "Pix", priceCents: 2000, paymentMode: "CHURCH_PIX", remaining: 1 },
        { id: "free", name: "Gratuito", priceCents: 0, modalityId: "outro" },
      ],
    });
    expect(catalog?.lots.map(lot => lot.id)).toEqual(["pix", "free"]);
    expect(availableEventLots(catalog!.lots, "individual", 1).map(lot => lot.id)).toEqual(["pix"]);
    expect(availableEventLots(catalog!.lots, "individual", 2)).toEqual([]);
  });

  it("exige sessão antes de enviar a inscrição", async () => {
    await expect(registerForEvent("encontro", {
      displayName: "Pessoa Teste", notificationEmail: "teste@example.test",
      modalityId: "individual", lotId: "lote", partySize: 1, isMinor: false,
    }, "")).rejects.toThrow("Entre na sua conta");
  });

  it("retoma o mesmo evento para membro ou convidado e rejeita destinos externos", () => {
    const account = (roleCode: string) => ({ grants: [{ roleCode }] } as LoginResult["user"]);
    expect(eventAuthHref("/login/", "culto-da-familia")).toBe("/login/?evento=culto-da-familia");
    expect(eventAuthHref("/cadastro/", "culto-da-familia")).toBe("/cadastro/?evento=culto-da-familia");
    expect(authenticatedLanding(account("MEMBRO"), "culto-da-familia")).toBe("/eventos/inscricao/?evento=culto-da-familia");
    expect(authenticatedLanding(account("CONVIDADO"), "culto-da-familia")).toBe("/eventos/inscricao/?evento=culto-da-familia");
    expect(authenticatedLanding(account("CONVIDADO"), "//example.test")).toBe("/app/convidado/");
    expect(authenticatedLanding(account("PLATFORM_ADMIN"), "culto-da-familia"))
      .toBe("/eventos/inscricao/?evento=culto-da-familia");
  });

  it("aceita somente o código opaco do ingresso no leitor", () => {
    expect(validRegistrationCode("b".repeat(32))).toBe(true);
    expect(validRegistrationCode("https://example.test")).toBe(false);
    expect(validRegistrationCode("b".repeat(33))).toBe(false);
  });
});
