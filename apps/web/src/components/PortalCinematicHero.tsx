"use client";

import Link from "next/link";
import { usePublishedSiteLayout } from "../lib/use-published-site-layout";
import { withBasePath } from "../lib/paths";
import { PortalGlyph } from "./PortalGlyph";
import s from "./portal-cinematic-hero.module.css";

/** A vitrine pública fala da igreja, não expõe módulos de gestão ministerial. */
export function PortalCinematicHero() {
  const site = usePublishedSiteLayout();
  const imageUrl = site.hero.imageUrl.startsWith("/") ? withBasePath(site.hero.imageUrl) : site.hero.imageUrl;
  return (
    <section id="inicio" className={s.hero} data-appearance={site.appearance} aria-labelledby="hero-title">
      <div className={s.visual} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} className={s.coverPhoto} alt="" fetchPriority="high" />
      </div>
      <div className={s.colorGrade} aria-hidden="true" />
      <div className={s.content}>
        <div className={s.kicker}>
          <span className={s.kickerLine} aria-hidden="true" />
          IGREJA DE DEUS <span aria-hidden="true">•</span> RIACHO FUNDO I
        </div>
        <h1 id="hero-title" className={s.headline}>
          <span>{site.hero.title}</span>
          <em>{site.hero.accent}</em>
        </h1>
        <p>{site.hero.description}</p>
        <div className={s.actions}>
          <Link href="/a-igreja/" className={s.primaryAction}>
            <span>Quem somos</span><PortalGlyph name="arrow" className={s.actionArrow} width={19} height={19} />
          </Link>
          <Link href="/eventos/" className={s.secondaryAction}>
            <span>Ver agenda</span><PortalGlyph name="arrow" className={s.actionArrow} width={19} height={19}/>
          </Link>
        </div>
      </div>
      <div className={s.heroFooter}>
        <span>UMA IGREJA PARA DEUS, PELAS FAMÍLIAS</span>
        <a href="#quem-somos" aria-label="Rolar para conhecer a igreja">
          Descubra nossa história <PortalGlyph name="down" width={18} height={18}/>
        </a>
      </div>
    </section>
  );
}
