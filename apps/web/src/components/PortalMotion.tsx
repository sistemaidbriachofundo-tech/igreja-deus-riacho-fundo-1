"use client";

import { useEffect, useState } from "react";
import s from "./portal-motion.module.css";

/**
 * Melhorias progressivas: sem JS, o conteúdo e a navegação continuam visíveis.
 * Não interfere no Church OS em /app e respeita prefers-reduced-motion.
 */
export function PortalMotion() {
  const [scrollProgress, setScrollProgress] = useState(0);
  const [showTop, setShowTop] = useState(false);

  useEffect(() => {
    const header = document.getElementById("topo");
    let frame = 0;

    const update = () => {
      frame = 0;
      const max = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
      const y = window.scrollY;
      setScrollProgress(Math.min(1, Math.max(0, y / max)));
      setShowTop(y > 650);
      if (header) header.dataset.scrolled = y > 44 ? "true" : "false";
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);

    const targets = Array.from(document.querySelectorAll<HTMLElement>("[data-portal-reveal]"));
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let observer: IntersectionObserver | undefined;
    if (!reduced && "IntersectionObserver" in window) {
      observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).dataset.portalVisible = "true";
            observer?.unobserve(entry.target);
          }
        }
      }, { rootMargin: "0px 0px -30px 0px", threshold: 0.08 });
      targets.forEach((target) => observer?.observe(target));
    }

    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) window.cancelAnimationFrame(frame);
      observer?.disconnect();
      if (header) delete header.dataset.scrolled;
    };
  }, []);

  return (
    <>
      <div className={s.progressTrack} aria-hidden="true">
        <div className={s.progressFill} style={{ transform: `scaleX(${scrollProgress})` }} />
      </div>
      <button
        type="button"
        className={showTop ? s.toTopVisible : s.toTop}
        aria-label="Voltar ao início da página"
        aria-hidden={!showTop}
        tabIndex={showTop ? 0 : -1}
        onClick={() => {
          const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          window.scrollTo({ top: 0, behavior: reduced ? "instant" : "smooth" });
          document.getElementById("hero-title")?.focus({ preventScroll: true });
          if (window.location.hash) history.pushState(null, "", window.location.pathname + window.location.search);
        }}
      >
        <span aria-hidden="true">↑</span>
      </button>
    </>
  );
}
