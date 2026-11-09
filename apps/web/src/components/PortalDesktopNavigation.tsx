"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import d from "./portal-design-system.module.css";

/** Site institucional: os ministérios são gerenciados na área autenticada. */
const PAGES = [
  { href: "/", label: "Início" },
  { href: "/a-igreja/", label: "Quem somos" },
  { href: "/eventos/", label: "Agenda" },
] as const;

export function PortalDesktopNavigation() {
  const pathname = usePathname();
  return <nav className={d.desktopNav} aria-label="Navegação do site público">
    {PAGES.map(item=>
      <Link key={item.href} href={item.href}
        aria-current={pathname === item.href || pathname === item.href.slice(0,-1) ? "page" : undefined}>
        {item.label}
      </Link>
    )}
  </nav>;
}
