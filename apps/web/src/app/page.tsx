import Link from "next/link";
import { withBasePath } from "../lib/paths";
import { events } from "../lib/portal-content";
import {
  PublicPage, Eyebrow, MinistryGrid, EventCard, DemoNote, ContactCTA,
  portalStyles as s,
} from "../components/PublicPortal";

export default function HomePage() {
  return (
    <PublicPage>
      <main id="conteudo">
        <section className={s.immersiveHero} aria-labelledby="hero-title">
          <div className={s.immersiveHeroGlow} aria-hidden="true" />
          <div className={s.immersiveHeroOrbit} aria-hidden="true" />
          <div className={s.immersiveHeroVisual} aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={withBasePath("/images/adoracao-oficial.jpg")} alt="" width={932} height={1180} fetchPriority="high" />
            <span className={s.heroVisualGrain} />
          </div>
          <div className={s.immersiveHeroContent}>
            <span className={s.immersiveHeroIndex}>IGREJA DE DEUS <span>—</span> RIACHO FUNDO I</span>
            <h1 id="hero-title" className={s.immersiveHeadline}>
              Existe um lugar
              <span>onde a fé</span>
              <em>vira encontro<span className={s.heroPeriod}>.</span></em>
            </h1>
            <div className={s.immersiveHeroDetails}>
              <p>Não é só sobre estar em um lugar. É sobre encontrar pessoas, compartilhar a caminhada e viver uma fé que faz sentido no dia a dia.</p>
              <div className={s.immersiveHeroActions}>
                <Link href="/contato/" className={s.roundedPrimary}>Planeje sua visita <span aria-hidden="true">↗</span></Link>
                <Link href="/a-igreja/" className={s.roundedText}>Conheça a igreja <span aria-hidden="true">↗</span></Link>
              </div>
            </div>
          </div>
          <div className={s.immersiveHeroBottom}>
            <span><i aria-hidden="true" /> UMA COMUNIDADE DE PORTAS ABERTAS</span>
            <a href="#ministries-title">DESÇA PARA CONHECER <span aria-hidden="true">↓</span></a>
          </div>
        </section>

        <div className={s.openingRibbon} aria-hidden="true">
          <div>GENTE QUE ACOLHE <span>✳</span> FÉ QUE TRANSFORMA <span>✳</span> UM LUGAR PARA PERTENCER <span>✳</span></div>
        </div>

        <section className={s.editorialStory} aria-labelledby="welcome-title">
          <div className={s.editorialStoryLead}>
            <Eyebrow>QUEM SOMOS • NOSSA ESSÊNCIA</Eyebrow>
            <h2 id="welcome-title">Uma igreja que não cabe <em>entre quatro paredes.</em></h2>
          </div>
          <div className={s.editorialStoryStage}>
            <div className={s.editorialStoryMark} aria-hidden="true">
              <span className={s.editorialStoryHalo} />
              <span className={s.editorialStoryLarge}>JUNTOS</span>
              <span className={s.editorialStorySmall}>01 / FÉ <b>•</b> 02 / COMUNHÃO <b>•</b> 03 / SERVIÇO</span>
            </div>
            <div className={s.editorialStoryCopy}>
              <span className={s.editorialStoryNumber}>01 — A IGREJA</span>
              <p>Acreditamos que toda história merece ser ouvida. Que comunhão se constrói na vida real. E que servir é uma das formas mais bonitas de demonstrar amor.</p>
              <p>Se você está chegando agora, aqui não precisa ter todas as respostas. Existe espaço para conhecer, conversar e caminhar no seu ritmo.</p>
              <Link href="/a-igreja/" className={s.editorialUnderline}>Nossa história e nossa comunidade <span aria-hidden="true">↗</span></Link>
            </div>
          </div>
        </section>

        <section className={s.openMinistries} aria-labelledby="ministries-title">
          <div className={s.openMinistriesHead}>
            <div><Eyebrow>VIDA EM COMUNIDADE / 05 MINISTÉRIOS</Eyebrow>
              <h2 id="ministries-title">Seu jeito de viver. <em>Um lugar para florescer.</em></h2>
            </div>
            <p>Jovens, homens, adolescentes, mulheres e voluntários. Não são departamentos. São pessoas caminhando juntas.</p>
          </div>
          <MinistryGrid />
          <Link href="/ministerios/" className={s.journeyAllLink}>Explore os cinco ministérios <span aria-hidden="true">↗</span></Link>
        </section>

        <section className={s.atmosphereSpotlight} aria-labelledby="atmosphere-title">
          <div className={s.atmosphereSpotlightArt} aria-hidden="true">
            <span className={s.atmosphereSpotlightOrbit} />
            <span className={s.atmosphereSpotlightWord}>SERVIR</span>
            <span className={s.atmosphereSpotlightSmall}>O EXTRAORDINÁRIO ACONTECE NOS DETALHES</span>
          </div>
          <div className={s.atmosphereSpotlightCopy}>
            <Eyebrow light>ATMOSFERA / VOLUNTARIADO</Eyebrow>
            <h2 id="atmosphere-title">Tem gente que faz a diferença <em>sem subir ao palco.</em></h2>
            <p>O Atmosfera é o espaço de quem transforma disponibilidade em cuidado. Cada detalhe, cada gesto e cada pessoa importam.</p>
            <Link href="/ministerios/atmosfera/" className={s.roundedPrimary}>Descubra como servir <span aria-hidden="true">↗</span></Link>
          </div>
        </section>

        <section className={s.editorialAgenda} aria-label="Agenda demonstrativa">
          <div className={s.editorialAgendaHead}>
            <div>
              <Eyebrow>ENCONTROS / AGENDA</Eyebrow>
              <h2>Histórias começam <em>quando a gente se encontra.</em></h2>
            </div>
            <Link href="/eventos/" className={s.editorialUnderline}>Explorar a agenda <span aria-hidden="true">↗</span></Link>
          </div>
          <div className={s.editorialAgendaGrid}>
            <p className={s.editorialAgendaCaption}>Uma demonstração de como ficará a programação pública da igreja. Os eventos e horários abaixo são fictícios.</p>
            <div className={s.eventList}>
              {events.slice(0, 3).map((event) => <EventCard event={event} key={event.id} />)}
              <DemoNote compact />
            </div>
          </div>
        </section>

        <section className={s.editorialPromise} aria-label="Uma comunidade de pessoas">
          <div className={s.editorialPromiseOrbit} aria-hidden="true" />
          <p>Antes de qualquer programação, <em>existem pessoas.</em> E cada pessoa importa.</p>
          <span>FÉ • FAMÍLIA • COMUNHÃO • MISSÃO</span>
        </section>

        <ContactCTA title="A sua história pode começar aqui." text="Há espaço para conhecer, se aproximar e descobrir como fazer parte da nossa comunidade." />
      </main>
    </PublicPage>
  );
}
