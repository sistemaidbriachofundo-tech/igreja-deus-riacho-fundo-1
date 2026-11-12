"use client";

import { useEffect } from "react";
import type { PublicSectionId } from "./PublicSectionLink";

/**
 * Endereços antigos continuam publicados e levam à seção da página única.
 * O caminho relativo preserva o prefixo do site (GitHub Pages ou raiz local).
 */
export function PublicSectionRedirect({ sectionId, label }: { sectionId: PublicSectionId; label: string }) {
  useEffect(() => {
    const next = new URL(`../#${sectionId}`, window.location.href);
    window.location.replace(next.href);
  }, [sectionId]);

  return <a href={`../#${sectionId}`}>{label}</a>;
}
