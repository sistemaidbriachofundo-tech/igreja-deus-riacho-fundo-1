import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { withBasePath } from "./paths";

const home = readFileSync(join(__dirname, "../app/page.tsx"), "utf8");
const status = readFileSync(join(__dirname, "../app/status/page.tsx"), "utf8");
const css = readFileSync(join(__dirname, "../app/globals.css"), "utf8");
const statusCss = readFileSync(join(__dirname, "../app/status/status.module.css"), "utf8");

describe("Portal público: descoberta da versão e acompanhamento", () => {
  it("exibe o anúncio da nova versão na primeira tela, sem substituir o portal institucional", () => {
    expect(home.indexOf("NOVA VERSÃO DISPONÍVEL")).toBeGreaterThan(-1);
    expect(home.indexOf("NOVA VERSÃO DISPONÍVEL")).toBeLessThan(home.indexOf('className="hero"'));
    expect(home).toContain('href={withBasePath("/app/demo/")}');
    expect(home).toContain('href={withBasePath("/status/")}');
    expect(home).not.toContain("Portal público · DAS");
  });
  it("oferece uma rota de acompanhamento com acesso aos módulos e limites claros", () => {
    for (const url of ["/app/", "/app/demo/", "/app/membros/", "/app/membros/carteirinha/"]) {
      expect(status).toContain('href: "' + url + '"');
    }
    expect(status).toContain("API não funciona dentro do GitHub Pages");
    expect(status).toContain("Nenhum cadastro realizado ali corresponde a uma pessoa real");
    expect(status).toContain("Pull Requests");
  });
  it("garante basePath correto em links de preview", () => {
    const old = process.env.NEXT_PUBLIC_BASE_PATH;
    process.env.NEXT_PUBLIC_BASE_PATH = "/igreja-deus-riacho-fundo-1";
    try {
      expect(withBasePath("/app/demo/")).toBe("/igreja-deus-riacho-fundo-1/app/demo/");
      expect(withBasePath("/status/")).toBe("/igreja-deus-riacho-fundo-1/status/");
    } finally {
      if (old === undefined) delete process.env.NEXT_PUBLIC_BASE_PATH;
      else process.env.NEXT_PUBLIC_BASE_PATH = old;
    }
  });
  it("tem estilos responsivos e destaque de versão identificável", () => {
    expect(css).toContain(".release-strip");
    expect(css).toContain("@media(max-width:850px)");
    expect(statusCss).toContain(".moduleGrid");
    expect(statusCss).toContain("@media(max-width:540px)");
  });
});
