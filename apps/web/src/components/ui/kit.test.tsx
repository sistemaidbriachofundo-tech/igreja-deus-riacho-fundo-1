import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Alert } from "./Alert";
import { Avatar, initials } from "./Avatar";
import { Breadcrumb } from "./Breadcrumb";
import { Button } from "./Button";
import { DataTable } from "./DataTable";
import { EmptyState } from "./Dashboard";
import { dialogKeyAction } from "./dialog";
import { Drawer } from "./Drawer";
import { PageHeader } from "./PageHeader";
import { PasswordField } from "./PasswordField";
import { Skeleton } from "./Skeleton";
import { StatCard } from "./StatCard";
import { Tabs } from "./Tabs";
import { nextTabIndex } from "./tabs";
import { Tooltip } from "./Tooltip";

describe("teclado de diálogo e abas", () => {
  it("fecha com Escape e circula o Tab", () => {
    expect(dialogKeyAction("Escape", false, 0, 2)).toEqual({ type: "close" });
    expect(dialogKeyAction("Tab", false, 1, 2)).toEqual({ type: "focus", index: 0 });
    expect(dialogKeyAction("Tab", true, 0, 2)).toEqual({ type: "focus", index: 1 });
    expect(dialogKeyAction("Tab", false, 0, 0)).toEqual({ type: "focus", index: -1 });
    expect(dialogKeyAction("Enter", false, 0, 2)).toEqual({ type: "ignore" });
  });

  it("move a aba com setas, Home e End", () => {
    expect(nextTabIndex(0, 3, "ArrowRight")).toBe(1);
    expect(nextTabIndex(0, 3, "ArrowLeft")).toBe(2);
    expect(nextTabIndex(1, 3, "Home")).toBe(0);
    expect(nextTabIndex(1, 3, "End")).toBe(2);
    expect(nextTabIndex(1, 3, "Enter")).toBeNull();
    expect(nextTabIndex(0, 0, "ArrowRight")).toBeNull();
  });
});

describe("peças do kit", () => {
  it("monta cabeçalho, indicador, trilha e avatar sem foto", () => {
    expect(initials("Ana Lima")).toBe("AL");
    expect(initials("João")).toBe("J");
    const header = renderToStaticMarkup(
      <PageHeader
        heading="h1"
        title="Painel"
        description="Resumo interno."
        breadcrumb={<Breadcrumb items={[{ label: "Início", href: "#inicio" }, { label: "Painel" }]} />}
      />,
    );
    expect(header).toContain("<h1");
    expect(header).toContain('aria-current="page"');
    expect(header).toContain('href="#inicio"');
    const avatar = renderToStaticMarkup(<Avatar name="Ana Lima" />);
    expect(avatar).toContain('aria-label="Ana Lima"');
    expect(avatar).toContain(">AL<");
    expect(avatar).not.toContain("<img");
    const stat = renderToStaticMarkup(<StatCard label="Pessoas" value="2" hint="Lista local" tone="warning" />);
    expect(stat).toContain("Pessoas");
    expect(stat).toContain("Requer atenção.");
  });

  it("expõe tabela, aviso, esqueleto, vazio e senha com alvo nomeado", () => {
    const table = renderToStaticMarkup(
      <DataTable
        caption="Pessoas fictícias"
        columns={[{ id: "name", header: "Nome", cell: (row: { name: string }) => row.name }]}
        rows={[{ name: "Clara Nunes" }]}
        getRowKey={(row) => row.name}
        toolbar={<span>Filtro local</span>}
      />,
    );
    expect(table).toContain("Pessoas fictícias");
    expect(table).toContain("Filtro local");
    expect(table).toContain('scope="col"');
    const alert = renderToStaticMarkup(
      <Alert tone="danger" title="Não foi possível concluir" onDismiss={() => {}}>
        Tente outra vez.
      </Alert>,
    );
    expect(alert).toContain('role="alert"');
    expect(alert).toContain("Fechar aviso");
    expect(renderToStaticMarkup(<Alert tone="info" title="Homologação">Texto.</Alert>)).toContain('role="status"');
    const skeleton = renderToStaticMarkup(<Skeleton label="Carregando o bloco" lines={2} />);
    expect(skeleton).toContain('role="status"');
    expect(skeleton).toContain("Carregando o bloco");
    expect(skeleton).toContain('aria-hidden="true"');
    const empty = renderToStaticMarkup(
      <EmptyState title="Nada publicado" message="Sem registros." action={<button type="button">Atualizar</button>} />,
    );
    expect(empty).toContain("Nada publicado");
    expect(empty).toContain("Atualizar");
    const password = renderToStaticMarkup(<PasswordField id="senha" label="Senha" />);
    expect(password).toContain('type="password"');
    expect(password).toContain('aria-label="Mostrar senha"');
    expect(password).toContain('for="senha"');
  });

  it("renderiza abas, dica e gaveta aberta", () => {
    const tabs = renderToStaticMarkup(
      <Tabs
        label="Exemplos"
        tabs={[
          { id: "um", label: "Um", panel: <p>Primeiro</p> },
          { id: "dois", label: "Dois", panel: <p>Segundo</p> },
        ]}
      />,
    );
    expect(tabs).toContain('role="tablist"');
    expect(tabs).toContain('aria-selected="true"');
    expect(tabs).toContain("Primeiro");
    expect(tabs).toContain("hidden");
    const tip = renderToStaticMarkup(
      <Tooltip content="Fecha com Escape.">
        <Button>Abrir</Button>
      </Tooltip>,
    );
    expect(tip).toContain('role="tooltip"');
    expect(tip).toContain("Fecha com Escape.");
    expect(tip).toContain("aria-describedby=");
    expect(
      renderToStaticMarkup(
        <Drawer open={false} title="Fechado" onClose={() => {}}>
          <p>Oculto</p>
        </Drawer>,
      ),
    ).toBe("");
    const drawer = renderToStaticMarkup(
      <Drawer open title="Filtros" description="Sem rede." onClose={() => {}}>
        <p>Conteúdo</p>
      </Drawer>,
    );
    expect(drawer).toContain('role="dialog"');
    expect(drawer).toContain("Filtros");
    expect(drawer).toContain('aria-label="Fechar"');
  });
});
