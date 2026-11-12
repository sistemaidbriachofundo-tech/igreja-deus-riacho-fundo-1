"use client";

import Link from "next/link";
import { useEffect, useState, type MouseEvent, type ReactNode } from "react";

export const PUBLIC_SECTIONS = [
  { id: "inicio", label: "Início" },
  { id: "quem-somos", label: "Quem somos" },
  { id: "agenda", label: "Agenda" },
] as const;

export type PublicSectionId = (typeof PUBLIC_SECTIONS)[number]["id"];

const FOCUS_TARGET: Record<PublicSectionId, string> = {
  inicio: "hero-title",
  "quem-somos": "identity-title",
  agenda: "agenda-title",
};

export function isPublicSectionId(value: string): value is PublicSectionId {
  return PUBLIC_SECTIONS.some((section) => section.id === value);
}

/** Extrai a seção quando o href é âncora da página única. Outros caminhos seguem navegação normal. */
export function sectionIdFromHref(href: string): PublicSectionId | null {
  const match = /^(?:\/)?#([a-z0-9-]+)$/i.exec(href);
  if (!match || !isPublicSectionId(match[1])) return null;
  return match[1];
}

export function revealPublicSection(id: PublicSectionId, historyMode: "push" | "none"): boolean {
  const section = document.getElementById(id);
  const focusTarget = document.getElementById(FOCUS_TARGET[id]);
  if (!section || !focusTarget) return false;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const behavior = reduced ? "instant" : "smooth";
  if (id === "inicio") {
    window.scrollTo({ top: 0, behavior });
  } else {
    const header = document.getElementById("topo");
    const headerHeight = header?.getBoundingClientRect().height ?? 88;
    const top = section.getBoundingClientRect().top + window.scrollY - headerHeight - 20;
    window.scrollTo({ top: Math.max(0, top), behavior });
  }
  focusTarget.focus({ preventScroll: true });
  if (historyMode === "push" && window.location.hash !== `#${id}`) {
    history.pushState(null, "", `#${id}`);
  }
  return true;
}

export function PortalSectionLink({
  sectionId,
  className,
  children,
  current = false,
  onNavigate,
}: {
  sectionId: PublicSectionId;
  className?: string;
  children: ReactNode;
  current?: boolean;
  onNavigate?: () => void;
}) {
  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    onNavigate?.();
    if (!document.getElementById(sectionId)) return;
    event.preventDefault();
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => revealPublicSection(sectionId, "push"));
    });
  }

  return (
    <Link
      href={`/#${sectionId}`}
      className={className}
      aria-current={current ? "location" : undefined}
      onClick={onClick}
    >
      {children}
    </Link>
  );
}

/** Marca a seção que está no topo da leitura, para a navegação por teclado e toque. */
export function useActivePublicSection(): PublicSectionId {
  const [active, setActive] = useState<PublicSectionId>("inicio");
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = Math.min(window.innerHeight * 0.33, 220);
      let current: PublicSectionId = "inicio";
      for (const section of PUBLIC_SECTIONS) {
        const element = document.getElementById(section.id);
        if (!element) continue;
        if (element.getBoundingClientRect().top - 96 <= line) current = section.id;
      }
      setActive(current);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("hashchange", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("hashchange", schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);
  return active;
}

/** Abre a âncora da URL e devolve o foco ao usar voltar do navegador. */
export function PublicHashFocus() {
  useEffect(() => {
    const hash = window.location.hash.replace("#", "");
    if (isPublicSectionId(hash)) {
      window.requestAnimationFrame(() => revealPublicSection(hash, "none"));
    }
    const onPop = () => {
      const next = window.location.hash.replace("#", "");
      if (isPublicSectionId(next)) {
        revealPublicSection(next, "none");
        return;
      }
      if (next) return;
      const title = document.getElementById("hero-title");
      window.scrollTo({ top: 0, behavior: "auto" });
      title?.focus({ preventScroll: true });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  return null;
}
