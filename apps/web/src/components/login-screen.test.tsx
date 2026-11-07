import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) =>
    <a href={href} {...props}>{children}</a>,
}));

import { LoginScreen } from "./LoginScreen";
import { AdminAccessGate } from "./AdminAccessGate";

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
    expect(html).toContain('autocomplete="username"');
    expect(html).toContain('autocomplete="current-password"');
    expect(html).toContain("Entrar no painel");
    expect(html).not.toContain('value="fake-token"');
  });

  it("mantém o painel escondido até a sessão ser confirmada", () => {
    const html = renderToStaticMarkup(
      <AdminAccessGate>
        <div>INFORMAÇÕES ADMINISTRATIVAS PRIVADAS</div>
      </AdminAccessGate>,
    );
    expect(html).toContain("Verificando seu acesso");
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
});
