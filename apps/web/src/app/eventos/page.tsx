import Link from "next/link";
import type { Metadata } from "next";
import { portalVisuals } from "../../lib/portal-visuals";
import { PublicPage } from "../../components/PublicPortal";
import { PublishedAgenda } from "../../components/PublicLiveSections";
import s from "../ministerios/ministry-v3.module.css";

export const metadata: Metadata = {
  title: "Agenda da Igreja",
  description: "Acompanhe encontros e eventos confirmados e publicados pela Igreja de Deus no Riacho Fundo I.",
};

export default function EventsPage() {
  return <PublicPage>
    <main id="conteudo">
      <section className={s.hubHero} aria-labelledby="agenda-title">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={portalVisuals.encounter} className={s.hubHeroImage} alt="" fetchPriority="high" />
        <div className={s.hubHeroShade} />
        <div className={s.hubHeroContent}>
          <div className={s.breadcrumb}><Link href="/">INÍCIO</Link> / AGENDA</div>
          <span className={s.label}>ENCONTROS E COMUNHÃO</span>
          <h1 id="agenda-title">Há momentos que<br/><em>nos aproximam.</em></h1>
          <p className={s.hubLead}>Encontros da comunidade em um só lugar, divulgados depois da confirmação pela igreja.</p>
          <a href="#agenda" className={s.hubExplore}>VER PRÓXIMOS ENCONTROS <span aria-hidden="true">↓</span></a>
        </div>
        <span className={s.photoDisclosure}>IMAGEM ILUSTRATIVA</span>
      </section>
      <section className={s.publishedAgendaSection} id="agenda" aria-label="Programação publicada">
        <PublishedAgenda />
      </section>
      <section className={s.hubFinal}>
        <span>NOSSA CASA ESTÁ DE PORTAS ABERTAS</span>
        <h2>O próximo encontro <em>pode mudar sua história.</em></h2>
        <Link href="/a-igreja/">Conheça nossa igreja <span aria-hidden="true">↗</span></Link>
      </section>
    </main>
  </PublicPage>;
}
