import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EventFilter } from "../components/EventFilter";
import { events } from "./portal-content";

describe("agenda pública", () => {
  it("exibe filtros reais por ministério, com estado selecionado acessível", () => {
    const html = renderToStaticMarkup(<EventFilter events={events} />);
    expect(html).toContain('aria-label="Filtrar eventos por ministério"');
    expect(html).toContain("Atmosfera");
    expect(html).toContain("Jovens");
    expect(html).toContain("5 encontros demonstrativos");
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    for (const event of events) expect(html).toContain(event.title);
  });

  it("não depende de API real para funcionar em GitHub Pages", () => {
    const html = renderToStaticMarkup(<EventFilter events={[]} />);
    expect(html).toContain("0 encontros demonstrativos");
    expect(html).not.toContain("undefined");
  });
});
