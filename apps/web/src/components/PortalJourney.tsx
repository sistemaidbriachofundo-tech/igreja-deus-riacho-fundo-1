"use client";
import { useEffect, useState } from "react";
import s from "./portal-journey.module.css";

const stops = [
  { id: "inicio", label: "Início", number: "01" },
  { id: "quem-somos", label: "A Igreja", number: "02" },
  { id: "ministries-title", label: "Ministérios", number: "03" },
  { id: "atmosfera", label: "Atmosfera", number: "04" },
  { id: "agenda", label: "Agenda", number: "05" },
] as const;

export function PortalJourney() {
  const [active, setActive] = useState<string>("inicio");

  useEffect(() => {
    const onScroll = () => {
      const position = window.scrollY + window.innerHeight * 0.48;
      let nearest: string = stops[0].id;
      for (const stop of stops) {
        const target = document.getElementById(stop.id);
        if (target && target.getBoundingClientRect().top + window.scrollY <= position) nearest = stop.id;
      }
      setActive(nearest);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <nav className={s.journey} aria-label="Navegar pelas seções da página">
      <span className={s.journeyLabel} aria-hidden="true">EXPLORE</span>
      {stops.map(stop => (
        <a key={stop.id} href={`#${stop.id}`} className={active === stop.id ? s.active : s.stop}
          aria-label={`Ir para ${stop.label}`} aria-current={active === stop.id ? "location" : undefined}
          title={stop.label}>
          <span className={s.marker} aria-hidden="true" />
          <span className={s.stopName}>{stop.number} — {stop.label}</span>
        </a>
      ))}
      <span className={s.journeyLine} aria-hidden="true" />
    </nav>
  );
}
