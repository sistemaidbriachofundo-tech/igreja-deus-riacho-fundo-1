import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CommunicationsBoard, providerIsSafeMock } from "./CommunicationsBoard";
import { AppShell } from "./AppShell";
import { renderAsRole, renderPending } from "../lib/test-session";

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
    expect(html).toContain("Consulta + WhatsApp no app");
    expect(html).toContain("wa.me");
    expect(html).toContain('data-contact-channel="whatsapp-deeplink"');
    expect(html).not.toContain("SEGREDO-NÃO-RENDERIZAR");
    expect(html).not.toContain("token-falso");
    expect(html).not.toContain("Disparar mensagens");
  });
});

describe("Navegação mobile — sem sete itens espremidos",()=>{
  it("não desenha a barra do celular sem sessão",()=>{
    const html=renderPending(<AppShell active="operacao" meta="Gestão integrada">
      <h1>Conteúdo do teste</h1>
    </AppShell>);
    expect(html).toContain('data-nav-state="pending"');
    expect(html).not.toContain('aria-label="Navegação principal no celular"');
    expect(html).not.toContain("Conteúdo do teste");
  });
  it("mantém quatro destinos do administrador e o botão Mais",()=>{
    const html=renderAsRole("PLATFORM_ADMIN", <AppShell active="operacao" meta="Gestão integrada">
      <h1>Conteúdo do teste</h1>
    </AppShell>);
    const mobile=html.split('aria-label="Navegação principal no celular"')[1]?.split("</nav>")[0]??"";
    expect((mobile.match(/<a\s/g)||[]).length).toBe(4);
    expect(mobile).toContain("Início");
    expect(mobile).toContain("Pastoral");
    expect(mobile).toContain("Secretaria");
    expect(mobile).toContain("Caixa");
    expect(mobile).not.toContain("Ministérios");
    expect(mobile).toContain("Mais módulos e páginas");
    expect(mobile).toContain('aria-haspopup="dialog"');
    expect(mobile).not.toContain("Carteira");
    expect(mobile).not.toContain("Membros e famílias");
    expect(html).toContain("Ministérios");
    expect(html).toContain("Conteúdo do teste");
  });
});
