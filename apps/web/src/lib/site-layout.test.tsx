import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { defaultSiteLayout, parseSiteLayout, parsePublicSiteLayout, siteSections } from "./site-layout";
import { PortalCinematicHero } from "../components/PortalCinematicHero";
import { PortalFaithGallery } from "../components/PortalFaithGallery";
import { PortalHomeSections } from "../components/PortalHomeSections";
import { SiteManager, SiteReaderPreview } from "../components/SiteManager";
import { readFileSync } from "node:fs";
import { SiteMediaLibrary } from "../components/SiteMediaLibrary";
import { ViviEditorialAssistant } from "../components/ViviEditorialAssistant";
import { PublishedSiteLayoutProvider } from "./use-published-site-layout";

describe("Gestão do Site — editor visual",()=>{
  it("accepts only safe layout and retains fallback",()=>{
    expect(parseSiteLayout(defaultSiteLayout)).toEqual(defaultSiteLayout);
    expect(parseSiteLayout({...defaultSiteLayout,appearance:"red"})).toBeNull();
    expect(parseSiteLayout({...defaultSiteLayout,hidden:["convite"]})).toBeNull();
    expect(parseSiteLayout({...defaultSiteLayout,sections:[...siteSections].reverse()})).not.toBeNull();
    expect(parseSiteLayout({...defaultSiteLayout,hero:{...defaultSiteLayout.hero,imageUrl:"javascript:alert(1)"}})).toBeNull();
    expect(parseSiteLayout({...defaultSiteLayout,hero:{...defaultSiteLayout.hero,imageUrl:"https://exemplo.test/foto.jpg"}})).toBeNull();
    expect(parseSiteLayout({...defaultSiteLayout,hero:{...defaultSiteLayout.hero,imageUrl:"https://store.public.blob.vercel-storage.com/church/c1/site/foto.jpg"}})?.hero.imageUrl).toContain("blob.vercel-storage.com");
  });
  it("rejects unauthenticated or malformed public data",()=>{
    expect(parsePublicSiteLayout({layout:null})).toEqual({layout:null});
    expect(parsePublicSiteLayout({layout:{version:2}})).toEqual({layout:null});
    expect(parsePublicSiteLayout({draft:defaultSiteLayout})).toEqual({layout:null});
  });
  it("keeps the approved public Home structure as default",()=>{
    const hero=renderToStaticMarkup(<PortalCinematicHero/>);
    const gallery=renderToStaticMarkup(<PortalFaithGallery/>);
    expect(hero).toContain(defaultSiteLayout.hero.title);
    expect(hero).toContain(defaultSiteLayout.hero.accent);
    expect(gallery).toContain(defaultSiteLayout.gallery.title);
    expect(gallery).toContain("galeria-louvor.webp");
    expect(gallery).toContain('data-appearance="dourado"');
  });
  it("renders existing sections without changing SSR order",()=>{
    const html=renderToStaticMarkup(
      <PortalHomeSections essencia={<p>Essência</p>} ministerios={<p>Ministérios</p>}
        galeria={<p>Galeria</p>} atmosfera={<p>Atmosfera</p>} visita={<p>Visita</p>}
        acontece={<p>Novidades</p>} videos={<p>Vídeos</p>} convite={<p>Convite</p>}/>
    );
    expect(html.indexOf("Essência")).toBeLessThan(html.indexOf("Galeria"));
    expect(html.indexOf("Galeria")).toBeLessThan(html.indexOf("Convite"));
  });
  it("provides authorized media upload without needing GitHub",()=>{
    const html=renderToStaticMarkup(<SiteMediaLibrary token="demo-token" onChoose={()=>{}}/>);
    expect(html).toContain("Enviar foto");
    expect(html).toContain("galeria-louvor.webp");
    expect(html).toContain('type="file"');
    expect(html).toContain("autorização");
  });
  it("connects the Riachinho panel without inventing a live AI provider",()=>{
    const html=renderToStaticMarkup(<ViviEditorialAssistant token="demo-token" layout={defaultSiteLayout}/>);
    expect(html).toContain("Riachinho");
    expect(html).toContain("Olá! Eu sou o Riachinho");
    expect(html).toContain("Consultando disponibilidade");
    expect(html).not.toContain("Modo de simulação");
    expect(html).not.toContain("IA disponível");
    expect(html).toContain("Não analisa imagens");
    expect(html).not.toContain("GEMINI_API_KEY");
    expect(html).not.toContain("MANUS_API_KEY");
  });
  it("shares one approved configuration with all Home sections", () => {
    const html = renderToStaticMarkup(
      <PublishedSiteLayoutProvider>
        <PortalCinematicHero />
        <PortalFaithGallery />
        <PortalHomeSections essencia={<p>Essência</p>} ministerios={<p>Ministérios</p>}
          galeria={<p>Galeria</p>} atmosfera={<p>Atmosfera</p>} visita={<p>Visita</p>}
          acontece={<p>Novidades</p>} videos={<p>Vídeos</p>} convite={<p>Convite</p>}/>
      </PublishedSiteLayoutProvider>
    );
    expect(html).toContain(defaultSiteLayout.hero.title);
    expect(html).toContain(defaultSiteLayout.gallery.title);
    expect(html).toContain("Convite");
  });
  it("provides an authenticated editor route without faking data",()=>{
    const html=renderToStaticMarkup(<SiteManager/>);
    expect(html).toContain("Seu site, nas mãos");
    expect(html).toContain("Gestão do site");
  });
  it("shows the reader exactly the published layout and keeps production behind the gate",()=>{
    const secret={...defaultSiteLayout,hero:{...defaultSiteLayout.hero,title:"RASCUNHO SECRETO 5a13"}};
    const empty=renderToStaticMarkup(<SiteReaderPreview published={null} device="mobile"/>);
    expect(empty).toContain("O leitor não vê o rascunho");
    expect(empty).not.toContain(secret.hero.title);
    expect(empty).toContain("gate");
    const published={...defaultSiteLayout,hero:{...defaultSiteLayout.hero,title:"Versão publicada 5a13"}};
    const live=renderToStaticMarkup(<SiteReaderPreview published={published} device="desktop"/>);
    expect(live).toContain("Versão publicada 5a13");
    expect(live).not.toContain("actorUserId");
    expect(live).toContain('data-reader="published"');
    const hook=readFileSync(joinSource("use-published-site-layout.ts"),"utf8");
    expect(hook).toContain('NEXT_PUBLIC_SITE_LAYOUT_LIVE_ENABLED !== "true"');
  });
});

function joinSource(name:string){
  return `${__dirname}/${name}`;
}
