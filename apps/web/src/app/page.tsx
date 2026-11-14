import { PublicPage } from "../components/PublicPortal";
import { PortalCinematicHero } from "../components/PortalCinematicHero";
import { PublishedAgenda } from "../components/PublicLiveSections";
import { PortalVideoShowcase } from "../components/PortalVideoShowcase";
import { PublishedSiteLayoutProvider } from "../lib/use-published-site-layout";
import { PortalIdentityPhoto } from "../components/PortalIdentityPhoto";
import { PortalFaithGallery } from "../components/PortalFaithGallery";
import { withBasePath } from "../lib/paths";
import s from "./home-institutional.module.css";

const purposes = [
  { title: "Adoração", detail: "Celebrar a Deus.", photo: "adoracao" },
  { title: "Comunhão", detail: "Pertencer e caminhar juntos.", photo: "comunidade" },
  { title: "Discipulado", detail: "Crescer na Palavra e na fé.", photo: "palavra" },
  { title: "Serviço", detail: "Cuidar das pessoas.", photo: "intercessao" },
  { title: "Evangelização e missão", detail: "Compartilhar a esperança.", photo: "templo" },
];

export default function HomePage() {
  return (
    <PublicPage overlayHeader>
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
              <h2 id="purposes-title">Como vivemos nossa fé</h2>
              <ul className={s.purposesList}>
                {purposes.map(purpose => (
                  <li key={purpose.title}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={withBasePath(`/images/riacho/${purpose.photo}.webp`)} alt="" loading="lazy" decoding="async" />
                    <div className={s.purposeCaption}><h3>{purpose.title}</h3><p>{purpose.detail}</p></div>
                  </li>
                ))}
              </ul>
            </div>
          </section>
          <section className={s.agenda} id="agenda" aria-labelledby="agenda-title">
            <div className={s.agendaWrap}><PublishedAgenda /></div>
          </section>
          <PortalVideoShowcase />
          <PortalFaithGallery />
        </PublishedSiteLayoutProvider>
      </main>
    </PublicPage>
  );
}
