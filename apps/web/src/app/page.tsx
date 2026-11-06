import Link from "next/link";
import { instagramUrl } from "../lib/portal-content";
import { portalVisuals } from "../lib/portal-visuals";
import { PublicPage } from "../components/PublicPortal";
import { FirstVisitFeature } from "../components/FirstVisit";
import { PublishedHomeSpotlight } from "../components/PublicLiveSections";
import { MinisterioEmFoco } from "../components/MinisterioEmFoco";
import { PortalCinematicHero } from "../components/PortalCinematicHero";
import { PortalVideoShowcase } from "../components/PortalVideoShowcase";
import { PortalFaithGallery } from "../components/PortalFaithGallery";
import { PortalHomeSections } from "../components/PortalHomeSections";
import { PortalButton } from "../components/PortalButton";
import s from "./home-v3.module.css";

export default function HomePage() {
  return (
    <PublicPage>
      <main id="conteudo">
        <PortalCinematicHero />

        <PortalHomeSections
          essencia={<>
          <section className={s.statement} id="quem-somos" aria-labelledby="statement-title">
                    <div className={s.statementLabel}><span>01 / NOSSA ESSÊNCIA</span><span>FÉ QUE VIRA VIDA</span></div>
                    <div className={s.statementLayout}>
                      <div className={s.statementCopy} data-portal-reveal>
                        <h2 id="statement-title">Mais do que um lugar.<br/><em>Uma família</em> em construção.</h2>
                        <p>Acreditamos em uma igreja feita de gente de verdade: que se encontra, acolhe, cuida e cresce junto. Aqui, sua história tem espaço.</p>
                        <PortalButton href="/a-igreja/" variant="text">Conheça nossa comunidade</PortalButton>
                      </div>
                      <figure className={s.statementPhoto} data-portal-reveal>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={portalVisuals.encounter} alt="Grupo de jovens celebrando juntos — imagem ilustrativa" loading="lazy" />
                        <figcaption>JUNTOS TEM OUTRO SIGNIFICADO. <small>IMAGEM ILUSTRATIVA</small></figcaption>
                      </figure>
                    </div>
                    <div className={s.values}>
                      <span><b>01.</b> FÉ</span><span><b>02.</b> FAMÍLIA</span><span><b>03.</b> COMUNHÃO</span><span><b>04.</b> PROPÓSITO</span>
                    </div>
                  </section>
          </>}
          ministerios={<>
          <section className={s.ministries} aria-labelledby="ministries-title" id="ministerios">
                    <div className={s.ministriesHeading}>
                      <div className={s.overline}>02 / VIDA EM COMUNIDADE</div>
                      <h2 id="ministries-title" data-portal-reveal>Para cada fase da vida,<br/><em>um lugar para pertencer.</em></h2>
                      <p>Não é sobre encontrar um departamento. É sobre encontrar pessoas. Escolha um ministério e descubra novas conexões.</p>
                    </div>
                    <MinisterioEmFoco />
                    <div className={s.ministriesBottom}><span>CINCO MINISTÉRIOS. UMA IGREJA.</span><Link href="/ministerios/">Ver todos os ministérios <span aria-hidden="true">↗</span></Link></div>
                  </section>
          </>}
          galeria={<>
          <PortalFaithGallery />
          </>}
          atmosfera={<>
          <section id="atmosfera" className={s.atmosfera} aria-labelledby="atmosfera-title">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={portalVisuals.atmosfera} className={s.atmosferaImage} alt="" loading="lazy" />
                    <div className={s.atmosferaOverlay} />
                    <div className={s.atmosferaInner} data-portal-reveal>
                      <span className={s.atmosferaLabel}>03 / ATMOSFERA • VOLUNTARIADO</span>
                      <h2 id="atmosfera-title">O amor também<br/>se vê em <em>ação.</em></h2>
                      <p>É nos detalhes, no acolhimento e na disposição de servir que a nossa comunidade ganha vida. Seu dom pode fazer a diferença.</p>
                      <PortalButton href="/ministerios/atmosfera/" variant="gold">Conheça o Atmosfera</PortalButton>
                      <span className={s.imageNote}>IMAGEM ILUSTRATIVA</span>
                    </div>
                  </section>
          </>}
          visita={<>
          <FirstVisitFeature />
          </>}
          acontece={<>
          <PublishedHomeSpotlight />
          </>}
          videos={<>
          <PortalVideoShowcase />
          </>}
          convite={<>
          <section className={s.visit} aria-labelledby="visit-title" data-portal-reveal>
                    <span>UMA COMUNIDADE DE PORTAS ABERTAS</span>
                    <h2 id="visit-title">Essa história também<br/><em>pode ser sua.</em></h2>
                    <div className={s.visitActions}><PortalButton href="/visita/" variant="gold">Planejar uma visita</PortalButton><a href={instagramUrl} target="_blank" rel="noopener noreferrer">Acompanhar no Instagram <span aria-hidden="true">↗</span></a></div>
                  </section>
          </>}
        />

      </main>
    </PublicPage>
  );
}
