import { PublicPage } from "../components/PublicPortal";
import { PortalCinematicHero } from "../components/PortalCinematicHero";
import { PublishedAgenda } from "../components/PublicLiveSections";
import { PortalVideoShowcase } from "../components/PortalVideoShowcase";
import { PublishedSiteLayoutProvider } from "../lib/use-published-site-layout";
import { PortalIdentityPhoto } from "../components/PortalIdentityPhoto";
import { PortalFaithGallery } from "../components/PortalFaithGallery";
import s from "./home-institutional.module.css";

export default function HomePage() {
  return (
    <PublicPage>
      <main id="conteudo" tabIndex={-1}>
        <PublishedSiteLayoutProvider>
          <PortalCinematicHero />
          <section className={s.identity} id="quem-somos" aria-labelledby="identity-title">
            <div className={s.identityContent}>
              <figure className={s.identityFigure}>
                <PortalIdentityPhoto />
              </figure>
              <div className={s.identityCopy}>
                <h2 id="identity-title" tabIndex={-1}>Quem somos</h2>
                <p>Fazemos parte da Igreja de Deus no Brasil. Aqui no Riacho Fundo I, nos reunimos para orar, estudar a Bíblia e servir à comunidade.</p>
                <p>Se você vem pela primeira vez, nossa equipe de recepção estará na entrada para acolher você e sua família.</p>
              </div>
            </div>
          </section>
          <section className={s.agenda} id="agenda" aria-labelledby="agenda-title">
            <div className={s.agendaWrap}><PublishedAgenda /></div>
          </section>
          <PortalFaithGallery />
          <PortalVideoShowcase />
        </PublishedSiteLayoutProvider>
      </main>
    </PublicPage>
  );
}
