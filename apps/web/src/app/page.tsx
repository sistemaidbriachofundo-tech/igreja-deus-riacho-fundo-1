import { PublicPage } from "../components/PublicPortal";
import { PortalCinematicHero } from "../components/PortalCinematicHero";
import { PortalBroadcastSection } from "../components/PortalBroadcast";
import { PublishedAgenda } from "../components/PublicLiveSections";
import { PortalVideoShowcase } from "../components/PortalVideoShowcase";
import { PublishedSiteLayoutProvider } from "../lib/use-published-site-layout";
import { PortalIdentityPhoto } from "../components/PortalIdentityPhoto";
import { PortalFaithGallery } from "../components/PortalFaithGallery";
import { PublishedFriendshipGroups } from "../components/PublishedFriendshipGroups";
import { withBasePath } from "../lib/paths";
import { instagramUrl } from "../lib/portal-content";
import s from "./home-institutional.module.css";

const purposes = [
  { title: "Adoração", description: "Celebrar a Deus.", photo: "fe-adoracao" },
  { title: "Comunhão", description: "Pertencer e caminhar juntos.", photo: "fe-comunhao" },
  { title: "Discipulado", description: "Crescer na Palavra e na fé.", photo: "fe-discipulado" },
  { title: "Serviço", description: "Cuidar das pessoas.", photo: "fe-servico" },
  { title: "Evangelização e missão", description: "Compartilhar a esperança.", photo: "fe-missao" },
];

export default function HomePage() {
  return (
    <PublicPage overlayHeader>
      <main id="conteudo" tabIndex={-1}>
        <PublishedSiteLayoutProvider>
          <PortalCinematicHero />
          <PortalBroadcastSection />
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
          <PortalFaithGallery />
          <section className={s.agenda} id="agenda" aria-labelledby="agenda-title">
            <div className={s.agendaWrap}><PublishedAgenda /></div>
          </section>
          <PortalVideoShowcase />
          <section className={s.purposes} id="propositos" aria-labelledby="purposes-title">
            <div className={s.purposesWrap}>
              <div className={s.purposesIntro}>
                <span>Por que existimos</span>
                <h2 id="purposes-title">Nossa fé se transforma em cuidado.</h2>
                <p>Os cinco propósitos da igreja dão direção à forma como nos reunimos, cuidamos e servimos.</p>
              </div>
              <ul className={s.purposesList} role="list">
                {purposes.map(({ title, description, photo }) => (
                  <li key={photo}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={withBasePath(`/images/${photo}.webp`)} width={512} height={512} loading="lazy" decoding="async" alt="" />
                    <div className={s.purposeCopy}>
                      <h3>{title}</h3>
                      <p>{description}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </section>
          <PublishedFriendshipGroups />
          <section className={s.social} aria-labelledby="social-title">
            <div className={s.socialContent}>
              <div>
                <h2 id="social-title">Siga as nossas redes sociais</h2>
                <p>Acompanhe os avisos e os encontros da igreja pelo Instagram.</p>
                <a href={instagramUrl} target="_blank" rel="noopener noreferrer">Instagram · @idbriacho_ <span aria-hidden="true">↗</span></a>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={withBasePath("/images/instagram-riacho.webp")} width={920} height={920} loading="lazy" decoding="async" alt="Perfil @idbriacho_ aberto no Instagram em um celular" />
            </div>
          </section>
        </PublishedSiteLayoutProvider>
      </main>
    </PublicPage>
  );
}
