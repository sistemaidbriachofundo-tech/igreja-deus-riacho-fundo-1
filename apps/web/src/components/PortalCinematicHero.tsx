"use client";

import { useEffect, useState } from "react";
import { usePublishedSiteLayout } from "../lib/use-published-site-layout";
import { PORTAL_CAMPAIGN_IMAGE, resolveSitePhoto } from "../lib/site-layout";
import { familyService, nextPublicService, sundayServices } from "../lib/public-service-schedule";
import { parsePublishedHome } from "../lib/portal-live-data";
import { usePublishedResource } from "../lib/use-published-resource";
import { PortalGlyph } from "./PortalGlyph";
import s from "./portal-cinematic-hero.module.css";

const directions = "https://www.waze.com/pt-BR/live-map/directions/igreja-de-deus-no-brasil-qs-12-riacho-fundo-1?to=place.w.204473961.2044608539.1892048";

export function PortalCinematicHero() {
  const { hero, appearance } = usePublishedSiteLayout();
  const isCampaignPhoto = hero.imageUrl === PORTAL_CAMPAIGN_IMAGE;
  const home = usePublishedResource("/public/home", parsePublishedHome);
  const notice = home.data?.banners.find(banner => banner.slug === "aviso-cultos" && banner.summary);
  const [next, setNext] = useState<ReturnType<typeof nextPublicService>>();
  useEffect(() => {
    const update = () => setNext(nextPublicService(new Date()));
    update();
    const interval = window.setInterval(update, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <section id="inicio" className={s.hero} data-appearance={appearance} aria-labelledby="hero-title">
      <div className={s.photo}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={resolveSitePhoto(hero.imageUrl)}
          alt={isCampaignPhoto ? "Duas pessoas com microfones diante da Igreja de Deus no Riacho Fundo I" : ""}
          width={isCampaignPhoto ? 1678 : undefined}
          height={isCampaignPhoto ? 937 : undefined}
          fetchPriority="high"
        />
      </div>
      <div className={s.layout}>
        <div className={s.intro}>
          <h1 id="hero-title" tabIndex={-1} className={s.headline}>{hero.description}</h1>
        </div>
        <div className={s.visit} aria-label="Horários dos cultos e endereço">
          <PortalGlyph name="calendar" width={23} height={23} />
          <div>
            <span className={s.visitLabel}>{notice ? "Horários habituais" : next ? "Próximo culto" : "Horários dos cultos"}</span>
            {next && !notice ? <>
              <strong>{next.day}, <time dateTime={next.clock}>{next.label}</time></strong>
              {next === familyService && <span className={s.serviceName}>{next.name}</span>}
            </> : <>
              <strong>{familyService.day}, <time dateTime={familyService.clock}>{familyService.label}</time></strong>
              <span className={s.serviceName}>Domingo, {sundayServices.map(service => service.label).join(" e ")}</span>
            </>}
          </div>
          <div className={s.address}>
            <span>QS 12, Riacho Fundo I</span>
            <a href={directions} target="_blank" rel="noopener noreferrer" aria-label="Como chegar pelo Waze (abre em outra aba)">
              Como chegar <span aria-hidden="true">↗︎</span>
            </a>
          </div>
        </div>
        {notice && <aside className={s.announcement} aria-label="Aviso de culto">
          <strong>{notice.title}</strong><span>{notice.summary}</span>
        </aside>}
      </div>
    </section>
  );
}
