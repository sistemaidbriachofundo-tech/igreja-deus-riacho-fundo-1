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
                <p>A Igreja de Deus está no Riacho Fundo I desde 1993. Nossa missão é <strong>amar a Deus, fortalecer famílias e servir com propósito</strong>.</p>
                <p>Queremos ser uma igreja bíblica, acolhedora e cheia do Espírito Santo, que forma discípulos e impacta a cidade e as nações.</p>
                <p>No domingo, nossa equipe de recepção recebe você na entrada. Na Sala de Comunhão, podemos nos conhecer melhor e conversar sobre os Primeiros Passos.</p>
                <p className={s.values}><span>Nossos valores</span><strong>A.C.O.L.H.E.R.</strong> reúne Amor, Comunhão, Obediência, Liderança, Honra, Excelência e Restauração.</p>
              </div>
            </div>
          </section>
          <section className={s.purposes} aria-labelledby="purposes-title">
            <div className={s.purposesWrap}>
              <div className={s.purposesIntro}>
                <span>PORQUE EXISTIMOS</span>
                <h2 id="purposes-title">Nossa fé se transforma em cuidado.</h2>
                <p>Os cinco propósitos da igreja dão direção à forma como nos reunimos, cuidamos e servimos.</p>
              </div>
              <ol className={s.purposesList}>
                <li><span>01</span><strong>Adoração</strong><small>Celebrar a Deus.</small></li>
                <li><span>02</span><strong>Comunhão</strong><small>Pertencer e caminhar juntos.</small></li>
                <li><span>03</span><strong>Discipulado</strong><small>Crescer na Palavra e na fé.</small></li>
                <li><span>04</span><strong>Serviço</strong><small>Cuidar das pessoas.</small></li>
                <li><span>05</span><strong>Evangelização e missão</strong><small>Compartilhar a esperança.</small></li>
              </ol>
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
