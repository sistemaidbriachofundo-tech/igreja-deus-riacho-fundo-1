import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CommunicationsBoard, providerIsSafeMock } from "./CommunicationsBoard";
import { AppShell } from "./AppShell";

describe("Comunicação F5 — monitoramento sem disparos",()=>{
  it("aceita somente canais explicitamente configurados como mock/noop",()=>{
    expect(providerIsSafeMock("mock")).toBe(true);
    expect(providerIsSafeMock("noop")).toBe(true);
    expect(providerIsSafeMock("live")).toBe(false);
    expect(providerIsSafeMock(undefined)).toBe(false);
  });
  it("não expõe destinatários nem controla envios no HTML inicial",()=>{
    const html=renderToStaticMarkup(<CommunicationsBoard templates={[
      {id:"t1",name:"TESTE lembrete",channel:"WHATSAPP",body:"SEGREDO-NÃO-RENDERIZAR"}
    ]} token="token-falso"/>);
    expect(html).toContain("Central de comunicação");
    expect(html).toContain("Somente consulta");
    expect(html).not.toContain("SEGREDO-NÃO-RENDERIZAR");
    expect(html).not.toContain("token-falso");
    expect(html).not.toContain("Disparar mensagens");
  });
});

describe("Navegação mobile — sem sete itens espremidos",()=>{
  it("mantém quatro destinos e botão Mais acessível",()=>{
    const html=renderToStaticMarkup(<AppShell active="operacao" meta="Gestão integrada">
      <h1>Conteúdo do teste</h1>
    </AppShell>);
    const mobile=html.split('aria-label="Navegação principal no celular"')[1]?.split("</nav>")[0]??"";
    expect((mobile.match(/<a\s/g)||[]).length).toBe(3);
    expect(mobile).toContain("Mais módulos e páginas");
    expect(mobile).toContain('aria-haspopup="dialog"');
    expect(mobile).toContain("Ministérios");
    expect(mobile).not.toContain("Carteira");
    expect(mobile).not.toContain("Membros e famílias");
  });
});
