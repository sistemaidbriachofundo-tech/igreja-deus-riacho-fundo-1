import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PortalDesktopNavigation } from "../components/PortalDesktopNavigation";
import { PortalHeader } from "../components/PublicPortal";
import { MobilePortalMenu } from "../components/MobilePortalMenu";
import { PortalCinematicHero } from "../components/PortalCinematicHero";
import { MinistryWorkspace } from "../components/MinistryWorkspace";
import { authenticatedLanding } from "./auth-destination";

const source = (path: string) => readFileSync(join(__dirname,"..",path),"utf8");

describe("separação entre site institucional e operação autenticada",()=>{
  it("restringe a navegação pública a Início, Quem somos, Agenda e Login",()=>{
    const nav=renderToStaticMarkup(<PortalDesktopNavigation/>);
    const header=renderToStaticMarkup(<PortalHeader/>);
    const mobile=renderToStaticMarkup(<MobilePortalMenu links={[
      {href:"/",label:"Início"},{href:"/a-igreja/",label:"Quem somos"},{href:"/eventos/",label:"Agenda"},
    ]}/>);
    expect(nav).toContain("Início");
    expect(nav).toContain("Quem somos");
    expect(nav).toContain("Agenda");
    expect(header).toContain("Login");
    for(const text of ["Ministérios","Novidades","Primeira visita","Participe conosco"]){
      expect(nav).not.toContain(text);
      expect(header).not.toContain(text);
      expect(mobile).not.toContain(text);
    }
  });

  it("retira módulos ministeriais e chamadas de primeira visita da Home",()=>{
    const home=source("app/page.tsx");
    const hero=renderToStaticMarkup(<PortalCinematicHero/>);
    expect(home).toContain("PublishedAgenda");
    expect(home).not.toContain("MinisterioEmFoco");
    expect(home).not.toContain("FirstVisitFeature");
    expect(home).not.toContain("PublishedHomeSpotlight");
    expect(hero).not.toContain("Conhecer ministério");
    expect(hero).not.toContain('href="/ministerios');
    expect(hero).not.toContain("Quero visitar");
  });

  it("só apresenta registros autorizados e não inventa saldo do caixa",()=>{
    const html=renderToStaticMarkup(<MinistryWorkspace ministries={[{id:"m1",name:"Homens"}]} token="apenas-teste"/>);
    expect(html).toContain("Homens");
    expect(html).toContain("Saldo ainda não disponível");
    expect(html).not.toContain("R$ 0,00");
    expect(html).toContain("cadastro integral de participantes");
  });

  it("mantém o Riachinho público com destinos institucionais e layout mobile",()=>{
    const chat=source("components/RiachinhoPublicChat.tsx");
    const css=source("components/riachinho-public-chat.module.css");
    expect(chat).toContain("Riachinho");
    expect(chat).not.toContain('href: "/ministerios/"');
    expect(chat).not.toContain('href: "/visita/"');
    expect(css).toContain("max-width:640px");
    expect(css).toContain("font-size:16px");
  });
  it("direciona o líder de ministério ao início, sem conceder permissões financeiras",()=>{
    const person={userId:"user1",personId:"person1",email:"test@example.test"};
    const leader={...person,grants:[{roleCode:"LIDER_MINISTERIO",ministryId:"homens"}]};
    const treasurer={...person,grants:[{roleCode:"TESOURARIA"}]};
    expect(authenticatedLanding(leader)).toBe("/app/");
    expect(authenticatedLanding(treasurer)).toBe("/app/");
    expect(authenticatedLanding({...person,grants:[{roleCode:"LIDER_MINISTERIO"},{roleCode:"SECRETARIA"}]})).toBe("/app/");
  });
});
