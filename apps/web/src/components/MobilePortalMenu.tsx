"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import s from "./public-portal.module.css";

type PublicLink = { href: string; label: string };

export function MobilePortalMenu({ links }: { links: ReadonlyArray<PublicLink> }) {
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

  const close = () => {
    if (menuRef.current) menuRef.current.open = false;
  };
  return (
    <details
      ref={menuRef}
      className={s.mobileMenu}
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
      onKeyDown={(event) => {
        if (event.key === "Escape" && menuRef.current?.open) {
          event.preventDefault();
          close();
          summaryRef.current?.focus();
        }
      }}
    >
      <summary ref={summaryRef} aria-label={isOpen ? "Fechar menu de navegação" : "Abrir menu de navegação"}>
        <span className={s.menuIcon} aria-hidden="true"><i /><i /></span>
        <span>{isOpen ? "Fechar" : "Menu"}</span>
      </summary>
      <nav aria-label="Menu mobile" className={s.mobileMenuPanel}>
        <Link href="/" onClick={close}>Início</Link>
        {links.map((item) => <Link key={item.href} href={item.href} onClick={close}>{item.label}</Link>)}
        <Link href="/app/" onClick={close}>Área interna (demonstração)</Link>
      </nav>
    </details>
  );
}
