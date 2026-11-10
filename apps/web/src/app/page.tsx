import { portalVisuals } from "../lib/portal-visuals";
import { PublicPage } from "../components/PublicPortal";
import { PortalCinematicHero } from "../components/PortalCinematicHero";
import { PortalSectionLink } from "../components/PublicSectionLink";
import { PublishedAgenda } from "../components/PublicLiveSections";
import { PublishedSiteLayoutProvider } from "../lib/use-published-site-layout";
import s from "./home-institutional.module.css";

/**
 * Site público: somente início, quem somos e agenda.
 * Toda a gestão de ministérios, equipes e finanças está em /app (autenticado).
 */
export default function HomePage() {
  return <PublicPage>
    <main id="conteudo" tabIndex={-1}>
      <PublishedSiteLayoutProvider>
        <PortalCinematicHero />
      </PublishedSiteLayoutProvider>

      <section className={s.identity} id="quem-somos" aria-labelledby="identity-title">
        <div className={s.identityContent}>
          <div className={s.identityCopy} data-portal-reveal>
            <span className={s.eyebrow}>01 / QUEM SOMOS</span>
            <h2 id="identity-title" tabIndex={-1}>Uma comunidade de fé. <em>Uma família em construção.</em></h2>
            <p>Somos a Igreja de Deus no Riacho Fundo I. Uma comunidade que busca viver a Palavra com verdade, servir com amor e caminhar ao lado das famílias.</p>
            <p>A igreja é feita de pessoas e de histórias. Queremos receber quem chega com amor e cuidado, fortalecer famílias e construir conexões que vão além dos encontros.</p>
            <PortalSectionLink sectionId="agenda" className={s.textLink}>
              Ver a agenda <span aria-hidden="true">↓</span>
            </PortalSectionLink>
          </div>
          <figure className={s.identityFigure} data-portal-reveal>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={portalVisuals.encounter} alt="Comunidade reunida — imagem ilustrativa" loading="lazy"/>
            <figcaption>FÉ · COMUNHÃO · FAMÍLIA <small>IMAGEM ILUSTRATIVA</small></figcaption>
          </figure>
        </div>
        <div className={s.values} aria-label="Nossos valores">
          <span><b>01</b> Fé</span><span><b>02</b> Família</span>
          <span><b>03</b> Comunhão</span><span><b>04</b> Serviço</span>
        </div>
        <div className={s.pillars} aria-label="O que nos move">
          <article className={s.pillar}><span>01</span><h3>Adorar</h3><p>Buscar a presença de Deus com sinceridade, Palavra e oração.</p></article>
          <article className={s.pillar}><span>02</span><h3>Cuidar</h3><p>Acolher pessoas, fortalecer laços e caminhar juntos.</p></article>
          <article className={s.pillar}><span>03</span><h3>Servir</h3><p>Expressar a fé com ações que transformam o nosso entorno.</p></article>
        </div>
      </section>

      <section className={s.agenda} id="agenda" aria-labelledby="agenda-title">
        <div className={s.agendaWrap}>
          <PublishedAgenda/>
        </div>
      </section>
    </main>
  </PublicPage>;
}
