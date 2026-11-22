import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AgendaEvent, AgendaEventStrip } from "./PublicLiveSections";
import type { PublishedEvent } from "../lib/portal-live-data";

const event: PublishedEvent = {
  id: "evento-a",
  slug: "encontro-familias",
  name: "Encontro de famílias",
  startsAt: "2026-11-28T22:00:00.000Z",
  endsAt: null,
  description: "Um tempo de comunhão e acolhimento.",
  imageUrl: "https://example.org/capa.png",
  locationText: "Riacho Fundo I",
  ministryId: null,
  featuredOnHome: true,
  registrationOpen: true,
};

describe("cards de próximos eventos", () => {
  it("exibe arte, data e inscrição no mesmo card, sem perder o destino da inscrição", () => {
    const html = renderToStaticMarkup(<AgendaEvent event={event} />);
    expect(html).toContain("Encontro de famílias");
    expect(html).toContain("Riacho Fundo I");
    expect(html).toContain("Inscrições abertas");
    expect(html).toContain("Ver evento e inscrever-se");
    expect(html).toContain("/eventos/inscricao/?evento=encontro-familias");
    expect(html).toContain("capa.png");
    expect(html).toContain('dateTime="2026-11-28T22:00:00.000Z"'.replace("dateTime", "dateTime")); // React SSR serializes time semantics.
  });

  it("mostra um estado sem inventar inscrição quando o evento está fechado", () => {
    const html = renderToStaticMarkup(<AgendaEvent event={{ ...event, imageUrl: null, registrationOpen: false }} />);
    expect(html).toContain("Inscrições indisponíveis");
    expect(html).toContain("RIACHO FUNDO I");
    expect(html).not.toContain("/eventos/inscricao/");
  });

  it("mantém todos os eventos em uma faixa horizontal acessível", () => {
    const html = renderToStaticMarkup(<AgendaEventStrip events={[event, { ...event, id: "evento-b", slug: "outro-evento" }]} />);
    expect(html).toContain('id="agenda-events"');
    expect(html).toContain('aria-labelledby="upcoming-events-title"');
    expect(html).toContain("Deslize para explorar os próximos encontros");
    expect(html.match(/class="[^"]*visitEvent/g)).toHaveLength(2);
  });
});
