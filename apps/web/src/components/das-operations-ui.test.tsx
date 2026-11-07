import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";

vi.mock("./AppShell",()=>({
  AppShell:({children}:{children:ReactNode})=><div data-testid="app-shell">{children}</div>,
  UIIcon:()=> <span aria-hidden="true"/>,
}));

import { DasOperations } from "./DasOperations";
import { PastoralBoard } from "./CareBoards";
import { FinanceBoard } from "./FinanceBoard";
import { EventsBoard } from "./EventsBoard";

const original=process.env.NEXT_PUBLIC_HML_ENABLED;
beforeEach(()=>{process.env.NEXT_PUBLIC_HML_ENABLED="false";});
afterEach(()=>{
  if(original===undefined)delete process.env.NEXT_PUBLIC_HML_ENABLED;
  else process.env.NEXT_PUBLIC_HML_ENABLED=original;
});

describe("Interface DAS — privacidade e estados",()=>{
  it("a página estática bloqueia operações quando HML não foi habilitada",()=>{
    const html=renderToStaticMarkup(<DasOperations/>);
    expect(html).toContain("Homologação desabilitada");
    expect(html).not.toContain("Conectado como");
    expect(html).not.toContain("Registros da API");
    expect((html.match(/<h1/g)||[]).length).toBe(1);
  });
  it("dados confidenciais do caso pastoral não aparecem na listagem",()=>{
    const html=renderToStaticMarkup(<PastoralBoard
      rows={[{id:"case-1",title:"Acompanhamento de teste",summary:"NOTAS-PASTORAIS-SECRETAS"}]}
      token="token-falso" refresh={()=>{}}/>);
    expect(html).toContain("Acompanhamento de teste");
    expect(html).not.toContain("NOTAS-PASTORAIS-SECRETAS");
  });
  it("importações financeiras avisam que o parser ainda não é real",()=>{
    const html=renderToStaticMarkup(<FinanceBoard tab="imports" rows={[]} token="token-falso" refresh={()=>{}}/>);
    expect(html).toMatch(/sem parser OFX real/);
    expect(html).not.toContain("Importação concluída");
  });
  it("eventos já publicados não oferecem edição pela HML",()=>{
    const html=renderToStaticMarkup(<EventsBoard
      rows={[{id:"ev-1",name:"Evento fictício publicado",status:"PUBLISHED",startsAt:"2026-11-07T20:00:00Z"}]}
      token="token-falso" refresh={()=>{}}/>);
    expect(html).toContain("Evento fictício publicado");
    expect(html).not.toContain("Revisar rascunho");
  });
});
