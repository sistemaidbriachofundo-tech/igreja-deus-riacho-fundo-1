import Link from "next/link";
import { portalVisuals } from "../lib/portal-visuals";
import { PublicPage } from "../components/PublicPortal";
import { PortalCinematicHero } from "../components/PortalCinematicHero";
import { PublishedAgenda } from "../components/PublicLiveSections";
import { PublishedSiteLayoutProvider } from "../lib/use-published-site-layout";
import s from "./home-institutional.module.css";

/**
 * Site público: somente início, quem somos e agenda.
 * Toda a gestão de ministérios, equipes e finanças está em /app (autenticado).
 */
export default function HomePage() {
  return <PublicPage>
    <main id="conteudo">
      <PublishedSiteLayoutProvider>
        <PortalCinematicHero />
      </PublishedSiteLayoutProvider>

      <section className={s.identity} id="quem-somos" aria-labelledby="identity-title">
        <div className={s.identityContent}>
          <div className={s.identityCopy} data-portal-reveal>
            <span className={s.eyebrow}>01 / QUEM SOMOS</span>
            <h2 id="identity-title">Uma comunidade de fé. <em>Uma família em construção.</em></h2>
            <p>Somos a Igreja de Deus no Riacho Fundo I. Uma comunidade que busca viver a Palavra com verdade, servir com amor e caminhar ao lado das famílias.</p>
            <Link className={s.textLink} href="/a-igreja/">
              Conheça nossa história <span aria-hidden="true">↗</span>
            </Link>
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
      </section>

      <section className={s.agenda} id="agenda" aria-label="Agenda oficial da igreja">
        <div className={s.agendaWrap}>
          <PublishedAgenda/>
          <Link className={s.agendaLink} href="/eventos/">
            Acessar agenda completa <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </section>
    </main>
  </PublicPage>;
}
