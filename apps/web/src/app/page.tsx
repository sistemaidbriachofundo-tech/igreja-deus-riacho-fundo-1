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
                <p>Somos a Igreja de Deus no Riacho Fundo I. Existimos para <strong>adorar a Deus, fortalecer famílias e servir à comunidade</strong>, crescendo na Palavra e levando esperança ao mundo.</p>
                <p>Se for sua primeira vez, pode chegar. Nossa equipe de recepção te espera na entrada. Queremos caminhar com você, desde o primeiro acolhimento até encontrar seu lugar para crescer e servir.</p>
                <p className={s.values}><span>NOSSOS VALORES</span><strong>A.C.O.L.H.E.R.</strong> — Amor, Comunhão, Obediência, Liderança, Honra, Excelência e Restauração.</p>
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
