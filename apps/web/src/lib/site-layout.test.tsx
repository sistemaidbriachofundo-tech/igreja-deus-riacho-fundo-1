import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { defaultSiteLayout, parseSiteLayout, parsePublicSiteLayout, siteSections } from "./site-layout";
import { PortalCinematicHero } from "../components/PortalCinematicHero";
import { PortalFaithGallery } from "../components/PortalFaithGallery";
import { PortalHomeSections } from "../components/PortalHomeSections";
import { SiteManager } from "../components/SiteManager";

describe("Gestão do Site — editor visual",()=>{
  it("accepts only safe layout and retains fallback",()=>{
    expect(parseSiteLayout(defaultSiteLayout)).toEqual(defaultSiteLayout);
    expect(parseSiteLayout({...defaultSiteLayout,appearance:"red"})).toBeNull();
    expect(parseSiteLayout({...defaultSiteLayout,hidden:["convite"]})).toBeNull();
    expect(parseSiteLayout({...defaultSiteLayout,sections:[...siteSections].reverse()})).not.toBeNull();
    expect(parseSiteLayout({...defaultSiteLayout,hero:{...defaultSiteLayout.hero,imageUrl:"javascript:alert(1)"}})).toBeNull();
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
  it("provides an authenticated editor route without faking data",()=>{
    const html=renderToStaticMarkup(<SiteManager/>);
    expect(html).toContain("Seu site, nas mãos");
    expect(html).toContain("Gestão do site");
  });
});
