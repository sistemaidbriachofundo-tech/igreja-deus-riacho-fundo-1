"use client";

import { useEffect, useState } from "react";
import { SITE_COVER_PHOTO } from "@idbrf/shared";
import { usePublishedSiteLayout } from "../lib/use-published-site-layout";
import { PUBLIC_FACADE_IMAGE, resolveSitePhoto } from "../lib/site-layout";
import { nextSundayService, sundayServices } from "../lib/public-service-schedule";
import { parsePublishedHome } from "../lib/portal-live-data";
import { usePublishedResource } from "../lib/use-published-resource";
import { PortalSectionLink } from "./PublicSectionLink";
import { PortalGlyph } from "./PortalGlyph";
import s from "./portal-cinematic-hero.module.css";

const directions = "https://www.waze.com/pt-BR/live-map/directions/igreja-de-deus-no-brasil-qs-12-riacho-fundo-1?to=place.w.204473961.2044608539.1892048";

export function PortalCinematicHero() {
  const { hero, appearance } = usePublishedSiteLayout();
  const home = usePublishedResource("/public/home", parsePublishedHome);
  const notice = home.data?.banners.find(banner => banner.slug === "aviso-cultos" && banner.summary);
  const [next, setNext] = useState<ReturnType<typeof nextSundayService>>();
  useEffect(() => {
    const update = () => setNext(nextSundayService(new Date()));
    update();
    const interval = window.setInterval(update, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <section id="inicio" className={s.hero} data-appearance={appearance} aria-labelledby="hero-title">
      <div className={s.photo}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={resolveSitePhoto(hero.imageUrl)} alt={[SITE_COVER_PHOTO, PUBLIC_FACADE_IMAGE].includes(hero.imageUrl) ? "Fachada da Igreja de Deus no Riacho Fundo I" : ""} fetchPriority="high" />
      </div>
      <div className={s.layout}>
        <div className={s.intro}>
          <p className={s.location}>Brasília, DF</p>
          <h1 id="hero-title" tabIndex={-1} className={s.headline}>
            <span>{hero.title}</span>
            <em>{hero.accent}</em>
          </h1>
          <p className={s.mission}>{hero.description}</p>
          <PortalSectionLink sectionId="quem-somos" className={s.primaryAction}>
            Quero conhecer <PortalGlyph name="arrow" width={17} height={17} />
          </PortalSectionLink>
        </div>
        <div className={s.visit} aria-label="Horários dos cultos e endereço">
          <PortalGlyph name="calendar" width={23} height={23} />
          <div>
            <span className={s.visitLabel}>{notice ? "Horários habituais" : next ? "Próximo culto" : "Cultos de domingo"}</span>
            <strong>{next && !notice ? <>Domingo, <time dateTime={next.clock}>{next.label}</time></> : sundayServices.map(service => service.label).join(" e ")}</strong>
          </div>
          <div className={s.address}>
            <span>QS 12, Riacho Fundo I</span>
            <a href={directions}>Como chegar <span aria-hidden="true">↗</span></a>
          </div>
        </div>
        {notice && <aside className={s.announcement} aria-label="Aviso de culto">
          <strong>{notice.title}</strong><span>{notice.summary}</span>
        </aside>}
      </div>
    </section>
  );
}
