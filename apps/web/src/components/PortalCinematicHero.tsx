"use client";

import { usePublishedSiteLayout } from "../lib/use-published-site-layout";
import { SITE_COVER_PHOTO } from "@idbrf/shared";
import { resolveSitePhoto } from "../lib/site-layout";
import { PortalSectionLink } from "./PublicSectionLink";
import s from "./portal-cinematic-hero.module.css";

export function PortalCinematicHero() {
  const { hero, appearance } = usePublishedSiteLayout();
  const imageUrl = resolveSitePhoto(hero.imageUrl);

  return (
    <section id="inicio" className={s.hero} data-appearance={appearance} aria-labelledby="hero-title">
      <div className={s.layout}>
        <div className={s.content}>
          <p className={s.kicker}>Igreja de Deus <span /> Riacho Fundo I</p>
          <h1 id="hero-title" tabIndex={-1} className={s.headline}>
            <span>{hero.title}</span>
            <em>{hero.accent}</em>
          </h1>
          <p className={s.description}>{hero.description}</p>
          <div className={s.actions}>
            <PortalSectionLink sectionId="agenda" className={s.primaryAction}>
              Ver agenda <span aria-hidden="true">↓</span>
            </PortalSectionLink>
            <PortalSectionLink sectionId="quem-somos" className={s.secondaryAction}>
              Quem somos
            </PortalSectionLink>
          </div>
        </div>
        <div className={s.window}>
          <div className={s.photo} data-facade={hero.imageUrl === SITE_COVER_PHOTO}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt={hero.imageUrl === SITE_COVER_PHOTO ? "Fachada da Igreja de Deus no Riacho Fundo I" : ""} fetchPriority="high" />
          </div>
        </div>
      </div>
    </section>
  );
}
