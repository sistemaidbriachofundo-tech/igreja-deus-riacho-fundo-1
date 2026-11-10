"use client";

import { usePublishedSiteLayout } from "../lib/use-published-site-layout";
import { withBasePath } from "../lib/paths";
import { portalVisuals } from "../lib/portal-visuals";
import { PortalGlyph } from "./PortalGlyph";
import { PortalSectionLink } from "./PublicSectionLink";
import s from "./portal-cinematic-hero.module.css";

/** A vitrine pública fala da igreja, não expõe módulos de gestão ministerial. */
export function PortalCinematicHero() {
  const site = usePublishedSiteLayout();
  const imageUrl = site.hero.imageUrl.startsWith("/") ? withBasePath(site.hero.imageUrl) : site.hero.imageUrl;
  return (
    <section id="inicio" className={s.hero} data-appearance={site.appearance} aria-labelledby="hero-title">
      <div className={s.visual} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={portalVisuals.hero} className={s.backdrop} alt="" fetchPriority="high" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={withBasePath("/images/hero-oficial.jpg")} className={s.stagePhoto} alt="" fetchPriority="high" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} className={s.worshipPhoto} alt="" fetchPriority="high" />
      </div>
      <div className={s.colorGrade} aria-hidden="true" />
      <div className={s.content}>
        <div className={s.kicker}>
          <span className={s.kickerLine} aria-hidden="true" />
          IGREJA DE DEUS <span aria-hidden="true">•</span> RIACHO FUNDO I
        </div>
        <h1 id="hero-title" className={s.headline} tabIndex={-1}>
          <span>{site.hero.title}</span>
          <em>{site.hero.accent}</em>
        </h1>
        <p>{site.hero.description}</p>
        <div className={s.actions}>
          <PortalSectionLink sectionId="quem-somos" className={s.primaryAction}>
            <span>Quem somos</span><PortalGlyph name="arrow" className={s.actionArrow} width={19} height={19} />
          </PortalSectionLink>
          <PortalSectionLink sectionId="agenda" className={s.secondaryAction}>
            <span>Ver agenda</span><PortalGlyph name="arrow" className={s.actionArrow} width={19} height={19}/>
          </PortalSectionLink>
        </div>
      </div>
      <div className={s.heroFooter}>
        <span>UMA IGREJA PARA DEUS, PELAS FAMÍLIAS</span>
        <PortalSectionLink sectionId="quem-somos">
          <span>Descubra nossa história</span> <PortalGlyph name="down" width={18} height={18}/>
        </PortalSectionLink>
      </div>
    </section>
  );
}
