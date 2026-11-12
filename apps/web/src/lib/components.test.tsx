import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppShell } from "../components/AppShell";
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
    const html = renderToStaticMarkup(
      <AppShell active="secretaria" meta="Secretaria · teste">
        <p>Conteúdo renderizado</p>
      </AppShell>,
    );
    expect(html).toContain('aria-label="Navegação principal"');
    expect(html).toContain('aria-label="Navegação principal no celular"');
    expect(html).toContain("Conteúdo renderizado");
    expect(html).toContain("Secretaria · teste");
    expect(html.match(/aria-current="page"/g)).toHaveLength(2);
    expect(html).toContain("Secretaria");
    expect(html).not.toContain("Membros e famílias");
  });

  it("não marca uma seção como ativa se nenhum item foi selecionado", () => {
    const html = renderToStaticMarkup(
      <AppShell meta="Exemplo"><span>Conteúdo</span></AppShell>,
    );
    expect(html).not.toContain('aria-current="page"');
  });

  it("respeita o basePath do GitHub Pages nos links do menu", () => {
    process.env.NEXT_PUBLIC_BASE_PATH = "/igreja-deus-riacho-fundo-1";
    const html = renderToStaticMarkup(
      <AppShell active="secretaria" meta="Exemplo">Teste</AppShell>,
    );
    expect(html).toContain('href="/igreja-deus-riacho-fundo-1/app/secretaria/"');
    expect(html).toContain('data-nav="client"');
    expect(html).toContain('href="/igreja-deus-riacho-fundo-1/app/#avisos"');
    expect(html.match(/aria-current="page"/g)).toHaveLength(2);
  });

  it.each([
    ["", "/login/"],
    ["/igreja", "/igreja/login/"],
    ["/igreja/", "/igreja/login/"],
  ])("monta caminhos com basePath '%s'", (base, expected) => {
    process.env.NEXT_PUBLIC_BASE_PATH = base;
    expect(withBasePath("/login/")).toBe(expected);
  });
});

describe("entrada antiga de demonstração", () => {
  it("não resta componente de login ilustrativo nas telas", () => {
    const root = join(__dirname, "..");
    const files: string[] = [];
    const visit = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          if (entry !== "node_modules") visit(full);
          continue;
        }
        if (/\.(ts|tsx)$/.test(entry) && !/\.(test|spec)\./.test(entry)) files.push(full);
      }
    };
    visit(root);
    const offenders = files.filter((file) => /\bDemoLogin\b|\bChurchWorkspace\b/.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });
});
