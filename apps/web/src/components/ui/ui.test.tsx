import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Button } from "./Button";
import { ErrorState } from "./Error";
import { Input } from "./Input";
import { Loading } from "./Loading";
import { Modal } from "./Modal";
import { DesignSystemShowcase } from "./Showcase";
import { Table } from "./Table";
import { nextFocusIndex } from "./focus";
import { contrastRatio, dsApprovedPairs, dsColor, dsRejectedPairs } from "./tokens";

const css = readFileSync(join(__dirname, "ui.module.css"), "utf8");

describe("tokens de contraste", () => {
  it("aprova os pares de texto, borda e foco", () => {
    for (const pair of dsApprovedPairs) {
      expect(contrastRatio(pair.fg, pair.bg), pair.name).toBeGreaterThanOrEqual(pair.min);
    }
  });

  it("recusa ouro, terracota e bronze como texto sobre creme", () => {
    for (const pair of dsRejectedPairs) {
      expect(contrastRatio(pair.fg, pair.bg), pair.name).toBeLessThan(pair.min);
    }
  });

  it("espelha a paleta e os breakpoints no CSS isolado", () => {
    for (const value of Object.values(dsColor)) {
      expect(css.toLowerCase()).toContain(value.toLowerCase());
    }
    expect(css).toContain("Montserrat");
    expect(css).toContain("Inter");
    expect(css).toContain("min-width: 768px");
    expect(css).toContain("min-width: 1440px");
    expect(css).toContain("min-height: 2.75rem");
    expect(css).toMatch(/\.primary\s*\{[^}]*background:\s*var\(--ds-gold\)/);
    expect(css).toMatch(/\.primary\s*\{[^}]*color:\s*var\(--ds-ink\)/);
    expect(css).not.toContain("--color-dourado");
  });
});

describe("ciclo de foco", () => {
  it("avança, recua e entra no diálogo pelo primeiro ou último item", () => {
    expect(nextFocusIndex(0, 3, false)).toBe(1);
    expect(nextFocusIndex(2, 3, false)).toBe(0);
    expect(nextFocusIndex(0, 3, true)).toBe(2);
    expect(nextFocusIndex(-1, 3, false)).toBe(0);
    expect(nextFocusIndex(-1, 3, true)).toBe(2);
    expect(nextFocusIndex(0, 0, false)).toBe(-1);
  });
});

describe("componentes da fundação", () => {
  it("não depende das telas de outras frentes", () => {
    const source = readdirSync(__dirname)
      .filter((file) => file.endsWith(".ts") || file.endsWith(".tsx"))
      .filter((file) => !file.endsWith(".test.tsx"))
      .map((file) => readFileSync(join(__dirname, file), "utf8"))
      .join("\n");
    expect(source).toContain("noValidate");
    expect(source).not.toContain("AppShell");
    expect(source).not.toContain("LoginScreen");
    expect(source).not.toContain("HmlPhaseOne");
    expect(source).not.toContain("MinistryWorkspace");
  });

  it("renderiza botão com tipo explícito", () => {
    expect(renderToStaticMarkup(<Button>Salvar</Button>)).toContain('type="button"');
    expect(renderToStaticMarkup(<Button type="submit">Enviar</Button>)).toContain('type="submit"');
  });

  it("liga rótulo, ajuda e erro ao campo", () => {
    const html = renderToStaticMarkup(
      <Input id="nome" label="Nome" hint="Como prefere ser chamada." error="Informe o nome." required />,
    );
    expect(html).toContain('for="nome"');
    expect(html).toContain('id="nome"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="nome-hint nome-error"');
    expect(html).toContain("obrigatório");
    expect(html).toContain('role="alert"');
  });

  it("expõe tabela com cabeçalho e lista estreita", () => {
    const html = renderToStaticMarkup(
      <Table
        caption="Cadastros sintéticos"
        columns={[{ id: "name", header: "Nome", cell: (row: { name: string }) => row.name }]}
        rows={[{ name: "Ana Lima" }]}
        getRowKey={(row) => row.name}
      />,
    );
    expect(html).toContain("Cadastros sintéticos");
    expect(html).toContain('scope="col"');
    expect(html).toContain("<dt>Nome</dt>");
    expect(html).toContain("Ana Lima");
  });

  it("mostra carregamento e erro com texto", () => {
    expect(renderToStaticMarkup(<Loading label="Carregando cadastros" />)).toContain('role="status"');
    const error = renderToStaticMarkup(
      <ErrorState title="Não foi possível mostrar a lista" message="Falha simulada." />,
    );
    expect(error).toContain('role="alert"');
    expect(error).toContain("Não foi possível mostrar a lista");
    expect(error).toContain("Falha simulada.");
  });

  it("só monta o diálogo quando está aberto", () => {
    expect(
      renderToStaticMarkup(
        <Modal open={false} title="Fechado" onClose={() => {}}>
          <p>Oculto</p>
        </Modal>,
      ),
    ).toBe("");
    const html = renderToStaticMarkup(
      <Modal open title="Novo cadastro sintético" description="Sem API." onClose={() => {}}>
        <button type="button">Salvar cadastro</button>
      </Modal>,
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("Novo cadastro sintético");
    expect(html).toContain("Sem API.");
    expect(html).toContain('aria-label="Fechar"');
  });

  it("mostra a vitrine com um título e dados fictícios", () => {
    const html = renderToStaticMarkup(<DesignSystemShowcase />);
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(html).toContain("ana.lima@example.test");
    expect(html).toContain("Nenhum destes nomes representa uma pessoa real.");
    expect(html).toContain("Ir para o conteúdo");
    expect(html).not.toContain("@gmail.");
  });
});
