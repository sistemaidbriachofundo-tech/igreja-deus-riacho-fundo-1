"use client";

import { usePathname } from "next/navigation";
import d from "./portal-design-system.module.css";
import { PUBLIC_SECTIONS, PortalSectionLink, useActivePublicSection } from "./PublicSectionLink";

/** Site institucional: uma página, três seções. Ministérios ficam na área autenticada. */
export function PortalDesktopNavigation() {
  const pathname = usePathname() ?? "";
  const onHome = pathname === "/" || pathname === "";
  const active = useActivePublicSection();
  return <nav className={d.desktopNav} aria-label="Navegação do site público">
    {PUBLIC_SECTIONS.map(item =>
      <PortalSectionLink key={item.id} sectionId={item.id} current={onHome && active === item.id}>
        {item.label}
      </PortalSectionLink>
    )}
  </nav>;
}
