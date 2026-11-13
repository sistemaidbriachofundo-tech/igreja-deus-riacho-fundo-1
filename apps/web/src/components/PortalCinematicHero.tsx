"use client";

import { usePublishedSiteLayout } from "../lib/use-published-site-layout";
import { SITE_COVER_PHOTO } from "@idbrf/shared";
import { PUBLIC_FACADE_IMAGE, resolveSitePhoto } from "../lib/site-layout";
import { PortalSectionLink } from "./PublicSectionLink";
import { PortalGlyph } from "./PortalGlyph";
import s from "./portal-cinematic-hero.module.css";

export function PortalCinematicHero() {
  const { hero, appearance } = usePublishedSiteLayout();
  const imageUrl = resolveSitePhoto(hero.imageUrl);

  return (
    <section id="inicio" className={s.hero} data-appearance={appearance} aria-labelledby="hero-title">
      <div className={s.photo}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt={[SITE_COVER_PHOTO, PUBLIC_FACADE_IMAGE].includes(hero.imageUrl) ? "Fachada da Igreja de Deus no Riacho Fundo I" : ""} fetchPriority="high" />
      </div>
      <div className={s.layout}>
        <div>
          <p className={s.location}>Brasília, DF</p>
          <h1 id="hero-title" tabIndex={-1} className={s.headline}>
            <span>{hero.title}</span>
            <em>{hero.accent}</em>
          </h1>
        </div>
        <div className={s.intro}>
          <p className={s.missionLabel}>NOSSA MISSÃO</p>
          <p className={s.missionStatement}>Uma igreja <strong>para Deus</strong>, pelas <strong>famílias</strong> e enviada ao <strong>mundo.</strong></p>
          {hero.description !== "Uma igreja para Deus, pelas famílias e enviada ao mundo." && <p className={s.description}>{hero.description}</p>}
          <PortalSectionLink sectionId="agenda" className={s.primaryAction}>
            Horários dos cultos <PortalGlyph name="down" width={17} />
          </PortalSectionLink>
        </div>
      </div>
    </section>
  );
}
