"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { PortalGlyph } from "./PortalGlyph";
import s from "./portal-design-system.module.css";
import { PortalSectionLink, sectionIdFromHref, useActivePublicSection } from "./PublicSectionLink";

type PublicLink = { href: string; label: string };

export function MobilePortalMenu({ links }: { links: ReadonlyArray<PublicLink> }) {
  const current = usePathname() ?? "";
  const onHome = current === "/" || current === "";
  const activeSection = useActivePublicSection();
  const menuRef = useRef<HTMLDetailsElement>(null);
  const summaryRef = useRef<HTMLElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (menuRef.current && event.target instanceof Node && !menuRef.current.contains(event.target)) {
        menuRef.current.open = false;
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);
  useEffect(() => { if (menuRef.current) menuRef.current.open = false; }, [current]);

  const close = () => { if (menuRef.current) menuRef.current.open = false; };

  return <details ref={menuRef} className={s.mobileMenu}
    onToggle={event=>setIsOpen(event.currentTarget.open)}
    onKeyDown={event=>{
      if (event.key === "Escape" && menuRef.current?.open) {
        event.preventDefault();
        close();
        summaryRef.current?.focus();
      }
    }}>
    <summary ref={summaryRef} aria-label={isOpen ? "Fechar menu" : "Abrir menu"}>
      <PortalGlyph name={isOpen ? "close" : "menu"}/>
    </summary>
    <nav aria-label="Navegação do site público no celular" className={s.mobileMenuPanel}>
      <span className={s.mobileCategory}>IGREJA DE DEUS · RIACHO FUNDO I</span>
      {links.map(link => {
        const sectionId = sectionIdFromHref(link.href);
        if (sectionId) {
          return <PortalSectionLink key={link.href} sectionId={sectionId} onNavigate={close}
            current={onHome && activeSection === sectionId}>
            {link.label}<PortalGlyph name="arrow" width={18}/>
          </PortalSectionLink>;
        }
        return <Link key={link.href} href={link.href} onClick={close}
          aria-current={current===link.href || current===link.href.slice(0,-1)?"page":undefined}>
          {link.label}<PortalGlyph name="arrow" width={18}/>
        </Link>;
      })}
      <Link className={s.mobileStaff} href="/login/" onClick={close}>
        Login <PortalGlyph name="arrow" width={18}/>
      </Link>
      <span className={s.mobileNote}>Um lugar de fé, comunhão e cuidado.</span>
    </nav>
  </details>;
}
