import { PublicPage } from "../components/PublicPortal";
import { PortalCinematicHero } from "../components/PortalCinematicHero";
import { PortalSectionLink } from "../components/PublicSectionLink";
import { PublishedAgenda } from "../components/PublicLiveSections";
import { PublishedSiteLayoutProvider } from "../lib/use-published-site-layout";
import { withBasePath } from "../lib/paths";
import s from "./home-institutional.module.css";

export default function HomePage() {
  return (
    <PublicPage>
      <main id="conteudo" tabIndex={-1}>
        <PublishedSiteLayoutProvider>
          <PortalCinematicHero />
        </PublishedSiteLayoutProvider>
        <section className={s.identity} id="quem-somos" aria-labelledby="identity-title">
          <div className={s.identityContent}>
            <figure className={s.identityFigure}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={withBasePath("/images/hero-oficial.jpg")} alt="Congregação reunida no templo da Igreja de Deus" width={928} height={1192} loading="lazy" />
            </figure>
            <div className={s.identityCopy}>
              <p className={s.eyebrow}>Quem somos</p>
              <h2 id="identity-title" tabIndex={-1}>A fé ganha vida <em>quando a gente se reúne.</em></h2>
              <p>Somos a Igreja de Deus no Riacho Fundo I, em Brasília. Nos reunimos para adorar, aprender a Palavra e cuidar uns dos outros.</p>
              <p>Queremos acolher quem chega e caminhar junto com as famílias, dentro e fora dos cultos.</p>
              <PortalSectionLink sectionId="agenda" className={s.textLink}>
                Veja quando nos reunimos <span aria-hidden="true">↘</span>
              </PortalSectionLink>
            </div>
          </div>
        </section>
        <section className={s.agenda} id="agenda" aria-labelledby="agenda-title">
          <div className={s.agendaWrap}><PublishedAgenda /></div>
        </section>
      </main>
    </PublicPage>
  );
}
