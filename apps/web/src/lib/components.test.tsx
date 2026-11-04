import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppShell } from "../components/AppShell";
import { DemoLogin } from "../components/DemoLogin";
import { withBasePath } from "./paths";

const originalBase = process.env.NEXT_PUBLIC_BASE_PATH;
const originalApi = process.env.NEXT_PUBLIC_API_URL;

afterEach(() => {
  if (originalBase === undefined) delete process.env.NEXT_PUBLIC_BASE_PATH;
  else process.env.NEXT_PUBLIC_BASE_PATH = originalBase;
  if (originalApi === undefined) delete process.env.NEXT_PUBLIC_API_URL;
  else process.env.NEXT_PUBLIC_API_URL = originalApi;
});

describe("navegação e renderização real de componentes", () => {
  it("renderiza sidebar e barra inferior com o mesmo item selecionado", () => {
    const html = renderToStaticMarkup(createElement(AppShell, {
      active: "secretaria", meta: "Secretaria · teste",
    }, createElement("p", null, "Conteúdo renderizado")));
    expect(html).toContain('aria-label="Navegação principal"');
    expect(html).toContain('aria-label="Navegação principal no celular"');
    expect(html).toContain("Conteúdo renderizado");
    expect(html).toContain("Secretaria · teste");
    expect(html.match(/aria-current="page"/g)).toHaveLength(2);
    expect(html).toContain("Explorar demonstração");
  });

  it("não marca uma seção como ativa se nenhum item foi selecionado", () => {
    const html = renderToStaticMarkup(createElement(AppShell, {
      meta: "Exemplo",
    }, createElement("span", null, "Conteúdo")));
    expect(html).not.toContain('aria-current="page"');
  });

  it("respeita o basePath do GitHub Pages nos links do menu", () => {
    process.env.NEXT_PUBLIC_BASE_PATH = "/igreja-deus-riacho-fundo-1";
    const html = renderToStaticMarkup(createElement(AppShell, {
      active: "demo", meta: "Exemplo",
    }, "Teste"));
    expect(html).toContain('href="/igreja-deus-riacho-fundo-1/app/demo/"');
    expect(html.match(/aria-current="page"/g)).toHaveLength(2);
  });

  it.each([
    ["", "/app/demo/"],
    ["/igreja", "/igreja/app/demo/"],
    ["/igreja/", "/igreja/app/demo/"],
  ])("monta caminhos com basePath '%s'", (base, expected) => {
    process.env.NEXT_PUBLIC_BASE_PATH = base;
    expect(withBasePath("app/demo/")).toBe(expected);
  });
});

describe("componente de autenticação em ambiente estático", () => {
  it("não exibe login falso quando API não está configurada", () => {
    delete process.env.NEXT_PUBLIC_API_URL;
    const html = renderToStaticMarkup(createElement(DemoLogin, {
      hintEmail: "ana.demo@example.test", onAuthenticated: vi.fn(),
    }));
    expect(html).toContain("modo de demonstração");
    expect(html).toContain("Abrir demonstração");
    expect(html).not.toContain('type="password"');
  });

  it("exibe formulário e não pré-preenche senha quando API está configurada", () => {
    process.env.NEXT_PUBLIC_API_URL = "https://api.example.test";
    const html = renderToStaticMarkup(createElement(DemoLogin, {
      hintEmail: "ana.demo@example.test", onAuthenticated: vi.fn(),
    }));
    expect(html).toContain('type="email"');
    expect(html).toContain('type="password"');
    expect(html).toContain('value="ana.demo@example.test"');
    expect(html).not.toContain('value="admin"');
    expect(html).toContain("Entrar no ambiente");
  });
});
