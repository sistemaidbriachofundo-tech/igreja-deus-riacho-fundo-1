"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ministries } from "../lib/portal-content";
import { PortalGlyph } from "./PortalGlyph";
import s from "./portal-design-system.module.css";

type PublicLink = { href: string; label: string };

export function MobilePortalMenu({ links }: { links: ReadonlyArray<PublicLink> }) {
  const current = usePathname();
  const menuRef = useRef<HTMLDetailsElement>(null);
  const summaryRef = useRef<HTMLElement>(null);
  const [isOpen,setIsOpen] = useState(false);

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (menuRef.current && event.target instanceof Node && !menuRef.current.contains(event.target)) menuRef.current.open = false;
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);
  useEffect(() => {
    if (menuRef.current) menuRef.current.open = false;
  },[current]);
  const close = () => { if (menuRef.current) menuRef.current.open = false; };
  return (
    <details ref={menuRef} className={s.mobileMenu}
      onToggle={e=>setIsOpen(e.currentTarget.open)}
      onKeyDown={e=>{if(e.key==="Escape"&&menuRef.current?.open){e.preventDefault();close();summaryRef.current?.focus();}}}>
      <summary ref={summaryRef} aria-label={isOpen?"Fechar menu de navegação":"Abrir menu de navegação"}>
        <PortalGlyph name={isOpen?"close":"menu"} />
      </summary>
      <nav aria-label="Menu mobile" className={s.mobileMenuPanel}>
        <Link href="/" onClick={close} aria-current={current==="/"?"page":undefined}>Início <PortalGlyph name="arrow" width={18}/></Link>
        {links.filter(item=>item.href!=="/ministerios/").map(item=>(
          <Link key={item.href} href={item.href} onClick={close}
            aria-current={current===item.href?"page":undefined}>{item.label}<PortalGlyph name="arrow" width={18}/></Link>
        ))}
        <span className={s.mobileCategory}>ENCONTRE SEU LUGAR</span>
        <div className={s.mobileMinistries}>
          {ministries.map(m=>(
            <Link key={m.slug} href={"/ministerios/"+m.slug+"/"} onClick={close}>
              <PortalGlyph name={m.slug==="jovens"?"users":m.slug==="mulheres"?"heart":m.slug==="homens"?"shield":m.slug==="adolescentes"?"sparkle":"hands"} width={18} height={18}/>
              {m.name}
            </Link>
          ))}
          <Link href="/ministerios/" onClick={close}><PortalGlyph name="arrow" width={18}/>Ver todos</Link>
        </div>
        <Link className={s.mobileVisit} href="/visita/" onClick={close}>
          Planejar minha visita <PortalGlyph name="arrow" width={20}/>
        </Link>
        <a className={s.mobileStaff} href="https://www.youtube.com/@IDBRiachoFundo1" target="_blank" rel="noopener noreferrer" onClick={close}>Canal no YouTube <PortalGlyph name="arrow" width={16}/></a>
        <Link className={s.mobileStaff} href="/app/" onClick={close}>Login · ID Riacho 1 (demonstração) <PortalGlyph name="arrow" width={16}/></Link>
        <span className={s.mobileNote}>Igreja de Deus · Riacho Fundo I. Você é bem-vindo.</span>
      </nav>
    </details>
  );
}
