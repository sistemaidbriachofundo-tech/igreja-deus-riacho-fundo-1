"use client";

import { useEffect, useState } from "react";
import { usePublishedSiteLayout } from "../lib/use-published-site-layout";
import { PORTAL_CAMPAIGN_IMAGE, PUBLIC_FACADE_IMAGE, resolveSitePhoto } from "../lib/site-layout";
import { familyService, nextPublicService, sundayServices } from "../lib/public-service-schedule";
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
  const [next, setNext] = useState<ReturnType<typeof nextPublicService>>();
  const [slide, setSlide] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const first = hero.imageUrl;
  const second = first === PORTAL_CAMPAIGN_IMAGE ? PUBLIC_FACADE_IMAGE : PORTAL_CAMPAIGN_IMAGE;
  const image = slide === 0 ? first : second;
  useEffect(() => {
    setPlaying(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const update = () => setNext(nextPublicService(new Date()));
    update();
    const interval = window.setInterval(update, 60_000);
    return () => window.clearInterval(interval);
  }, []);
  useEffect(() => {
    if (!playing || interacting) return;
    const interval = window.setInterval(() => setSlide(current => 1 - current), 8_000);
    return () => window.clearInterval(interval);
  }, [playing, interacting]);

  function changeSlide() {
    setPlaying(false);
    setSlide(current => 1 - current);
  }

  return (
    <section id="inicio" className={s.hero} data-appearance={appearance} data-campaign={image === PORTAL_CAMPAIGN_IMAGE} aria-labelledby="hero-title">
      <div className={s.photo} id="imagem-da-capa">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={resolveSitePhoto(image)} alt={image === PORTAL_CAMPAIGN_IMAGE ? "Duas pessoas com microfones diante da Igreja de Deus no Riacho Fundo I" : image === PUBLIC_FACADE_IMAGE ? "Fachada da Igreja de Deus no Riacho Fundo I" : ""} fetchPriority="high" />
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
            <span className={s.visitLabel}>{notice ? "Horários habituais" : next ? "Próximo culto" : "Horários dos cultos"}</span>
            {next && !notice ? <>
              <strong>{next.day}, <time dateTime={next.clock}>{next.label}</time></strong>
              {next === familyService && <span className={s.serviceName}>{next.name}</span>}
            </> : <>
              <strong>Quinta, {familyService.label}</strong>
              <span className={s.serviceName}>Domingo, {sundayServices.map(service => service.label).join(" e ")}</span>
            </>}
          </div>
          <div className={s.address}>
            <span>QS 12, Riacho Fundo I</span>
            <a href={directions}>Como chegar <span aria-hidden="true">↗</span></a>
          </div>
        </div>
        <div className={s.carousel} role="group" aria-label="Carrossel de imagens da igreja"
          onMouseEnter={() => setInteracting(true)} onMouseLeave={() => setInteracting(false)}
          onFocus={() => setInteracting(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setInteracting(false); }}>
          <button type="button" aria-controls="imagem-da-capa" aria-label="Imagem anterior" onClick={changeSlide}>←</button>
          <span aria-live={playing ? "off" : "polite"}>{slide + 1} de 2</span>
          <button type="button" aria-controls="imagem-da-capa" aria-label="Próxima imagem" onClick={changeSlide}>→</button>
          <button type="button" className={s.play} onClick={() => setPlaying(value => !value)}>
            {playing ? "Pausar" : "Reproduzir"}
          </button>
        </div>
        {notice && <aside className={s.announcement} aria-label="Aviso de culto">
          <strong>{notice.title}</strong><span>{notice.summary}</span>
        </aside>}
      </div>
    </section>
  );
}
