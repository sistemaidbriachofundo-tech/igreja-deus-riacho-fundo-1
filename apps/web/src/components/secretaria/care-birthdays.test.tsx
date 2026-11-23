import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CareBirthdayList } from "./CareBirthdays";

describe("aniversariantes do cuidado", () => {
  it("mostra o nome uma vez e não oferece telefone nem WhatsApp", () => {
    const html = renderToStaticMarkup(<CareBirthdayList birthdays={[
      { id: "ana", name: "Ana Exemplo", date: "2026-11-23" },
      { id: "bruno", name: "Bruno Exemplo", date: "2026-11-23" },
    ]} />);
    expect(html).toContain("Ana Exemplo");
    expect(html).toContain("Bruno Exemplo");
    expect(html).toContain("23/11");
    expect(html.match(/Ana Exemplo/g)).toHaveLength(1);
    expect(html).not.toContain("wa.me");
    expect(html).not.toContain("WhatsApp");
    expect(html).not.toMatch(/\+55|telefone/i);
  });

  it("explica a lista vazia sem inventar pessoa", () => {
    const html = renderToStaticMarkup(<CareBirthdayList birthdays={[]} />);
    expect(html).toContain("Nenhum aniversário hoje");
    expect(html).not.toContain("Exemplo");
  });
});
