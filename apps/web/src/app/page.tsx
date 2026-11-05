import Link from "next/link";
import { events, instagramUrl } from "../lib/portal-content";
import { portalVisuals } from "../lib/portal-visuals";
import { PublicPage, EventCard, DemoNote } from "../components/PublicPortal";
import { MinisterioEmFoco } from "../components/MinisterioEmFoco";
import { PortalJourney } from "../components/PortalJourney";
import s from "./home-v3.module.css";

export default function HomePage() {
  return (
    <PublicPage>
      <main id="conteudo">
        <PortalJourney />
        <section id="inicio" className={s.hero} aria-labelledby="hero-title">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={portalVisuals.hero} alt="" className={s.heroImage} fetchPriority="high" />
          <div className={s.heroOverlay} />
          <div className={s.heroHalo} aria-hidden="true"><span /><span /></div>
          <div className={s.heroContent}>
            <div className={s.heroIntro}><span className={s.dot} /> IGREJA DE DEUS <span className={s.bar}>/</span> RIACHO FUNDO I</div>
            <h1 id="hero-title">Existe um lugar<br/>para a <em>sua história.</em></h1>
            <p>Uma comunidade para pertencer, crescer na fé e descobrir que caminhar junto transforma tudo.</p>
            <div className={s.heroButtons}>
              <Link className={s.actionMain} href="/contato/">Quero conhecer a igreja <span aria-hidden="true">↗</span></Link>
              <Link className={s.actionGhost} href="/ministerios/">Explorar ministérios <span aria-hidden="true">→</span></Link>
            </div>
          </div>
          <div className={s.heroBottom}><span>SEJA BEM-VINDO À NOSSA CASA</span><a href="#quem-somos">CONHEÇA-NOS <span aria-hidden="true">↓</span></a><span>IMAGEM ILUSTRATIVA</span></div>
        </section>

        <section className={s.statement} id="quem-somos" aria-labelledby="statement-title">
          <div className={s.statementLabel}><span>01 / NOSSA ESSÊNCIA</span><span>FÉ QUE VIRA VIDA</span></div>
          <div className={s.statementLayout}>
            <div className={s.statementCopy} data-portal-reveal>
              <h2 id="statement-title">Mais do que um lugar.<br/><em>Uma família</em> em construção.</h2>
              <p>Acreditamos em uma igreja feita de gente de verdade: que se encontra, acolhe, cuida e cresce junto. Aqui, sua história tem espaço.</p>
              <Link href="/a-igreja/" className={s.underlined}>Conheça nossa comunidade <span aria-hidden="true">↗</span></Link>
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

        <section className={s.ministries} aria-labelledby="ministries-title" id="ministerios">
          <div className={s.ministriesHeading}>
            <div className={s.overline}>02 / VIDA EM COMUNIDADE</div>
            <h2 id="ministries-title" data-portal-reveal>Para cada fase da vida,<br/><em>um lugar para pertencer.</em></h2>
            <p>Não é sobre encontrar um departamento. É sobre encontrar pessoas. Escolha um ministério e descubra novas conexões.</p>
          </div>
          <MinisterioEmFoco />
          <div className={s.ministriesBottom}><span>CINCO MINISTÉRIOS. UMA IGREJA.</span><Link href="/ministerios/">Ver todos os ministérios <span aria-hidden="true">↗</span></Link></div>
        </section>

        <section id="atmosfera" className={s.atmosfera} aria-labelledby="atmosfera-title">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={portalVisuals.atmosfera} className={s.atmosferaImage} alt="" loading="lazy" />
          <div className={s.atmosferaOverlay} />
          <div className={s.atmosferaInner} data-portal-reveal>
            <span className={s.atmosferaLabel}>03 / ATMOSFERA • VOLUNTARIADO</span>
            <h2 id="atmosfera-title">O amor também<br/>se vê em <em>ação.</em></h2>
            <p>É nos detalhes, no acolhimento e na disposição de servir que a nossa comunidade ganha vida. Seu dom pode fazer a diferença.</p>
            <Link href="/ministerios/atmosfera/" className={s.lightAction}>Conheça o Atmosfera <span aria-hidden="true">↗</span></Link>
            <span className={s.imageNote}>IMAGEM ILUSTRATIVA</span>
          </div>
        </section>

        <section id="agenda" className={s.agenda} aria-label="Agenda demonstrativa">
          <div className={s.agendaIntro} data-portal-reveal>
            <div><span className={s.overline}>04 / VIDA QUE ACONTECE</span><h2>Próximos <em>encontros.</em></h2></div>
            <div><p>Veja como aparecerão aqui os encontros e eventos da igreja. A agenda abaixo é exclusivamente demonstrativa.</p><Link href="/eventos/" className={s.underlined}>Explorar a agenda <span aria-hidden="true">↗</span></Link></div>
          </div>
          <div className={s.agendaList}>{events.slice(0,3).map(event => <EventCard event={event} key={event.id} />)}</div>
          <DemoNote compact />
        </section>

        <section className={s.visit} aria-labelledby="visit-title" data-portal-reveal>
          <span>O COMEÇO DE UMA NOVA HISTÓRIA</span>
          <h2 id="visit-title">A próxima pessoa<br/>que chega <em>pode ser você.</em></h2>
          <div className={s.visitActions}><Link href="/contato/">Prepare sua primeira visita <span aria-hidden="true">↗</span></Link><a href={instagramUrl} target="_blank" rel="noopener noreferrer">Acompanhar no Instagram <span aria-hidden="true">↗</span></a></div>
        </section>

      </main>
    </PublicPage>
  );
}
