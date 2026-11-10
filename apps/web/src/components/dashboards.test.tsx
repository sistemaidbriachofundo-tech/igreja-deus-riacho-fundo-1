import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AppShell } from "./AppShell";
import { CredentialCards, type CredentialPreviewProps } from "./HmlPhaseOne";
import { PersonaBoard, parseIndicatorCounts, parseOwnCard, parseEntries, deskKeyFor } from "./PersonaHome";
import type { AuthUser } from "../lib/api";

function account(role: string, email = `${role.toLowerCase()}@example.test`): AuthUser {
  return { userId: `u-${role}`, personId: `p-${role}`, email, grants: [{ roleCode: role }] };
}

function board(role: string) {
  return renderToStaticMarkup(
    <AppShell active="visao" meta="Início" viewer={account(role)}>
      <PersonaBoard />
    </AppShell>,
  );
}

const TITLES: Record<string, string> = {
  PLATFORM_ADMIN: "Mesa da administração",
  SECRETARIA: "Mesa da secretaria",
  PASTOR: "Mesa pastoral",
  TESOURARIA: "Mesa da tesouraria",
  LIDER_MINISTERIO: "Mesa da liderança",
  MEMBRO: "Seu espaço",
  EDITOR_SITE: "Mesa de edição",
  PUBLICADOR_SITE: "Mesa de publicação",
};

describe("mesa por persona", () => {
  it.each(Object.keys(TITLES))("abre a mesa de %s sem jargão e sem valor inventado", role => {
    const html = board(role);
    expect(html).toContain(TITLES[role]);
    expect(html).toContain("Ambiente de homologação");
    expect(html).toContain(`data-desk="${deskKeyFor([role])}"`);
    expect(html).not.toMatch(/endpoint|schema|PostgreSQL|CHURCH OS|\b501\b|roster/i);
    expect(html).not.toContain("R$");
    expect(html).not.toContain("87%");
    expect(html).not.toContain("412");
  });

  it("membro navega só para a própria carteirinha e a própria escala", () => {
    const html = board("MEMBRO");
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map(match => match[1] ?? "");
    expect(hrefs.some(href => href.endsWith("/app/membros/carteirinha/"))).toBe(true);
    expect(hrefs.some(href => href.endsWith("/app/servir/meu-espaco/"))).toBe(true);
    expect(hrefs.some(href => href.endsWith("/app/tesouraria/"))).toBe(false);
    expect(hrefs.some(href => href.endsWith("/app/secretaria/"))).toBe(false);
    expect(hrefs.some(href => href.endsWith("/app/membros/"))).toBe(false);
    expect(hrefs.some(href => href.endsWith("/app/editorial/"))).toBe(false);
  });

  it("não transforma campo ausente em zero", () => {
    const counts = parseIndicatorCounts({ counts: { membershipsActive: 4 } });
    expect(counts?.membershipsActive).toBe(4);
    expect(counts?.pastoralOpen).toBeNull();
    expect(counts?.admissionsOpen).toBeNull();
    expect(parseIndicatorCounts({ counts: { membershipsActive: "4" } })?.membershipsActive).toBeNull();
    expect(parseOwnCard({ card: null, qrPayload: "nao-mostrar" })).toEqual({ state: "absent" });
    expect(parseOwnCard({ card: { displayName: "Ana Lima", qrPayload: "opaco" } })).toEqual({ state: "active", name: "Ana Lima" });
    expect(parseEntries({ entries: [{ id: "1", description: "Dízimo", amountCents: 1500 }] })).toEqual([
      { id: "1", title: "Dízimo", detail: "Registrado", amountCents: 1500 },
    ]);
    expect(parseEntries({ entries: [{ id: "2", description: "Sem valor" }] })).toEqual([]);
  });
});

describe("carteirinhas na secretaria", () => {
  it("encaixa o preview da frente C sem desenhar a carteirinha no lugar dele", () => {
    function Preview(props: CredentialPreviewProps) {
      return <p>PREVIEW-{props.personName}-{props.active ? "ativa" : "aguardando"}</p>;
    }
    const html = renderToStaticMarkup(
      <CredentialCards
        busy={false}
        CredentialPreview={Preview}
        onToggle={() => undefined}
        memberships={[{
          id: "m-1",
          status: "ACTIVE",
          joinedAt: "2026-01-15T12:00:00.000Z",
          notes: null,
          activeCredentialId: "c-1",
          person: { id: "p-1", displayName: "João Silva", email: null, status: "ACTIVE", householdId: null },
        }]}
      />,
    );
    expect(html).toContain("PREVIEW-João Silva-ativa");
    expect(html).toContain("Revogar credencial");
    expect(html).not.toContain("qrPayload");
  });
});
