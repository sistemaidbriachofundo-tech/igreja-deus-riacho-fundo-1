import Link from "next/link";
import { withBasePath } from "../lib/paths";
import { events, instagramUrl } from "../lib/portal-content";
import { PublicPage, Eyebrow, SectionHeading, MinistryGrid, EventCard, DemoNote, ContactCTA, portalStyles as s } from "../components/PublicPortal";

export default function HomePage() {
  return (
    <PublicPage>
      <main id="conteudo">
        <section className={s.hero} aria-labelledby="hero-title">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={s.heroImage} src={withBasePath("/images/hero-oficial.jpg")} alt="" width={928} height={1192} fetchPriority="high" />
          <div className={s.heroScrim} />
          <div className={s.heroInner}>
            <div className={s.heroContent}>
              <div className={s.heroStamp}>IGREJA DE DEUS <span aria-hidden="true">/</span> RIACHO FUNDO I</div>
              <h1 id="hero-title" className={s.heroTitle}>Existe um lugar <em>para você</em> aqui.</h1>
              <p className={s.heroLead}>Mais que um endereço, uma comunidade de fé. Gente de verdade, histórias diferentes e o mesmo propósito: caminhar com Deus e cuidar de pessoas.</p>
              <div className={s.heroActions}>
                <Link className={s.primaryButton} href="/contato/">Planeje sua visita <span aria-hidden="true">↗</span></Link>
                <Link className={s.outlineButton} href="/a-igreja/">Conheça nossa igreja <span aria-hidden="true">↗</span></Link>
              </div>
              <div className={s.heroMeta}><span>FÉ <b>·</b> FAMÍLIA</span><span>COMUNHÃO <b>·</b> MISSÃO</span></div>
            </div>
          </div>
          <div className={s.heroSide}><span>DESÇA PARA EXPLORAR</span><span className={s.heroSideNumber}>↓</span></div>
        </section>

        <div className={s.marquee}>
          <div className={s.marqueeInner}>
            <span>UMA CASA DE PORTAS ABERTAS</span>
            <span>Venha como você está. Há lugar para caminhar conosco.</span>
            <a href={instagramUrl} target="_blank" rel="noopener noreferrer">Acompanhe os avisos oficiais ↗</a>
          </div>
        </div>

        <section className={s.mainSection + " " + s.sectionWhite} aria-labelledby="welcome-title">
          <div className={s.missionGrid}>
            <div className={s.missionCopy}>
              <Eyebrow>QUEM SOMOS</Eyebrow>
              <h2 id="welcome-title">Uma igreja viva. <span>Uma família em construção.</span></h2>
              <p>Acreditamos que a fé também se expressa em acolhimento, serviço, amizades e cuidado. Cada pessoa tem uma história — e toda história merece ser recebida com amor e respeito.</p>
              <p>Queremos que sua primeira visita seja o começo de uma conexão verdadeira, no seu ritmo e com espaço para suas perguntas.</p>
              <Link href="/a-igreja/" className={s.textLink}>Descubra nossa comunidade <span aria-hidden="true">↗</span></Link>
            </div>
            <div className={s.missionPhoto}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className={s.missionPhotoFrame} src={withBasePath("/images/adoracao-oficial.jpg")} width={932} height={1180} alt="Momento de adoração na Igreja de Deus no Riacho Fundo I" loading="lazy" />
              <div className={s.missionBadge}><small>MAIS QUE UM LUGAR</small><strong>Uma comunidade para pertencer.</strong></div>
            </div>
          </div>
          <div className={s.statStrip} aria-label="Valores da comunidade">
            <div className={s.statItem}><strong>Fé que aproxima</strong><span>Uma caminhada que pode ser compartilhada.</span></div>
            <div className={s.statItem}><strong>Cuidado que acolhe</strong><span>Gente cuidando de gente, em cada fase da vida.</span></div>
            <div className={s.statItem}><strong>Serviço que transforma</strong><span>Dons e talentos colocados em movimento.</span></div>
          </div>
        </section>

        <section className={s.mainSection} aria-labelledby="ministries-title">
          <SectionHeading id="ministries-title" eyebrow="NOSSOS MINISTÉRIOS" title="Muitos caminhos. Um mesmo propósito." description="Encontre pessoas com quem caminhar. Cada ministério é uma porta para conexão, crescimento e serviço." href="/ministerios/" linkLabel="Conheça todos" />
          <MinistryGrid />
        </section>

        <section className={s.mainSection + " " + s.sectionMuted} aria-label="Agenda demonstrativa">
          <div className={s.eventListShell}>
            <div className={s.eventAside}>
              <Eyebrow>O QUE VEM POR AÍ</Eyebrow>
              <h2>Momentos para viver juntos.</h2>
              <p>Veja como será a experiência de agenda pública. Os encontros abaixo são exemplos para avaliação visual, não convites para eventos confirmados.</p>
              <Link href="/eventos/" className={s.textLink}>Ver agenda demonstrativa <span aria-hidden="true">↗</span></Link>
              <DemoNote compact />
            </div>
            <div className={s.eventList}>
              {events.slice(0, 3).map((event) => <EventCard event={event} key={event.id} />)}
            </div>
          </div>
        </section>

        <section className={s.quoteSection} aria-label="Nosso compromisso">
          <p className={s.quoteText}>A igreja é feita de pessoas. <span>E pessoas não são números: são histórias para acolher.</span></p>
        </section>

        <ContactCTA />
      </main>
    </PublicPage>
  );
}
