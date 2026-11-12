import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) =>
    <a href={href} {...props}>{children}</a>,
}));

import { LoginScreen } from "./LoginScreen";
import { AdminAccessGate, SessionGateNotice } from "./AdminAccessGate";

const original = process.env.NEXT_PUBLIC_HML_ENABLED;
beforeEach(() => { process.env.NEXT_PUBLIC_HML_ENABLED = "true"; });
afterEach(() => {
  if (original === undefined) delete process.env.NEXT_PUBLIC_HML_ENABLED;
  else process.env.NEXT_PUBLIC_HML_ENABLED = original;
});

describe("Acesso institucional antes do painel", () => {
  it("mostra e-mail e senha imediatamente na rota Login", () => {
    const html = renderToStaticMarkup(<LoginScreen />);
    expect(html).toContain('type="email"');
    expect(html).toContain('type="password"');
    expect(html).toMatch(/autocomplete="username"/i);
    expect(html).toMatch(/autocomplete="current-password"/i);
    expect(html).toContain("Entrar no painel");
    expect(html).not.toContain("Seu acesso é individual");
    expect(html).not.toContain("autorização institucional");
    expect(html).toContain("Não possui acesso?");
    expect(html).not.toContain('value="fake-token"');
  });

  it("mantém o painel escondido até a sessão ser confirmada", () => {
    const html = renderToStaticMarkup(
      <AdminAccessGate>
        <div>INFORMAÇÕES ADMINISTRATIVAS PRIVADAS</div>
      </AdminAccessGate>,
    );
    expect(html).toContain('aria-label="Carregando painel"');
    expect(html).not.toContain("Verificando seu acesso");
    expect(html).not.toContain("INFORMAÇÕES ADMINISTRATIVAS PRIVADAS");
    expect((html.match(/<h1/g) ?? []).length).toBe(1);
  });

  it("não dá acesso ao painel apenas por abrir a página sem API habilitada", () => {
    process.env.NEXT_PUBLIC_HML_ENABLED = "false";
    const html = renderToStaticMarkup(
      <AdminAccessGate><div>PAINEL INTERNO</div></AdminAccessGate>,
    );
    expect(html).not.toContain("PAINEL INTERNO");
  });

  it("explica falha de rede sem pedir senha e sem tratar 403 como logout", () => {
    const unavailable = renderToStaticMarkup(
      <SessionGateNotice mode="unavailable" onRetry={() => undefined} onSignOut={() => undefined} />,
    );
    expect(unavailable).toContain("Você não foi desconectado.");
    expect(unavailable).toContain("Tentar de novo");
    expect(unavailable).not.toContain('type="password"');
    const forbidden = renderToStaticMarkup(
      <SessionGateNotice mode="forbidden" onSignOut={() => undefined} />,
    );
    expect(forbidden).toContain("o servidor não autorizou o painel");
    expect(forbidden).not.toContain('type="password"');
    expect(forbidden).toContain("Sair da sessão");
  });
});
