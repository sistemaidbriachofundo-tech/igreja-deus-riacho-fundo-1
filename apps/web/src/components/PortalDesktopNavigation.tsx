"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ministries } from "../lib/portal-content";
import { PortalGlyph } from "./PortalGlyph";
import d from "./portal-design-system.module.css";

const primary = [
  { href:"/",label:"Início" },
  { href:"/a-igreja/",label:"Quem somos" },
  { href:"/eventos/",label:"Agenda" },
  { href:"/novidades/",label:"Novidades" },
  { href:"/visita/",label:"Primeira visita" },
] as const;

export function PortalDesktopNavigation() {
  const current = usePathname();
  const details = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && details.current && !details.current.contains(event.target)) details.current.open = false;
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  return (
    <nav className={d.desktopNav} aria-label="Navegação principal">
      {primary.slice(0,2).map(({ href,label })=>
        <Link key={href} href={href} aria-current={current===href?"page":undefined}>{label}</Link>)}
      <details ref={details} className={d.navDropdown} data-active={current?.startsWith("/ministerios")?"true":"false"}
        onKeyDown={(event)=>{if(event.key==="Escape"){details.current?.removeAttribute("open");(details.current?.querySelector("summary") as HTMLElement|null)?.focus();}}}>
        <summary aria-label="Abrir opções dos ministérios">Ministérios <PortalGlyph name="chevron" width={14} height={14}/></summary>
        <div className={d.megaMenu}>
          <div className={d.megaTopline}>UM LUGAR PARA CADA HISTÓRIA</div>
          <div className={d.megaGrid}>
            {ministries.map(ministry=>(
              <Link key={ministry.slug} href={"/ministerios/"+ministry.slug+"/"} onClick={()=>{if(details.current)details.current.open=false;}}>
                <PortalGlyph name={ministry.slug==="jovens"?"users":ministry.slug==="mulheres"?"heart":ministry.slug==="homens"?"shield":ministry.slug==="adolescentes"?"sparkle":"hands"} width={21} height={21}/>
                <span><strong>{ministry.name}</strong><small>{ministry.eyebrow.toLowerCase()}</small></span>
              </Link>
            ))}
          </div>
          <div className={d.megaFooter}><span>Juntos somos uma comunidade.</span><Link href="/ministerios/" onClick={()=>{if(details.current)details.current.open=false;}}>Todos os ministérios <PortalGlyph name="arrow" width={15}/></Link></div>
        </div>
      </details>
      {primary.slice(2).map(({ href,label })=>
        <Link key={href} href={href} aria-current={current===href?"page":undefined}>{label}</Link>)}
    </nav>
  );
}
