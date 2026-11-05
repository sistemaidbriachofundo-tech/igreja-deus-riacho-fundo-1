import Link from "next/link";
import type { Metadata } from "next";
import { events } from "../../lib/portal-content";
import { portalVisuals } from "../../lib/portal-visuals";
import { PublicPage, DemoNote } from "../../components/PublicPortal";
import { EventFilter } from "../../components/EventFilter";
import s from "../ministerios/ministry-v3.module.css";

export const metadata: Metadata = {
  title: "Agenda",
  description: "Agenda ilustrativa da Igreja de Deus no Riacho Fundo I. As datas demonstrativas não são eventos oficiais.",
};

export default function EventsPage() {
  return <PublicPage>
    <main id="conteudo">
      <section className={s.hubHero}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={portalVisuals.encounter} className={s.hubHeroImage} alt="" fetchPriority="high" />
        <div className={s.hubHeroShade} />
        <div className={s.hubHeroContent}>
          <div className={s.breadcrumb}><Link href="/">INÍCIO</Link> / AGENDA</div>
          <span className={s.label}>ENCONTROS E COMUNHÃO</span>
          <h1>Há momentos que<br/><em>nos aproximam.</em></h1>
          <p className={s.hubLead}>Conheça o formato da futura agenda integrada da igreja e dos ministérios.</p>
          <a href="#agenda" className={s.hubExplore}>EXPLORAR AGENDA <span aria-hidden="true">↓</span></a>
        </div>
        <span className={s.photoDisclosure}>IMAGEM ILUSTRATIVA</span>
      </section>
      <section className={s.detailEvents} id="agenda" aria-label="Agenda demonstrativa">
        <div><span className={s.label}>01 / PROGRAMAÇÃO</span><h2>A vida acontece <em>quando nos encontramos.</em></h2><p>Os eventos e horários abaixo são exemplos fictícios para avaliação visual do portal. Ainda não existe inscrição ou pagamento nesta página.</p><DemoNote compact /></div>
        <div><EventFilter events={events} /></div>
      </section>
      <section className={s.hubFinal}><span>PARA SABER A PROGRAMAÇÃO OFICIAL</span><h2>Vamos continuar <em>conectados.</em></h2><Link href="/contato/">Consulte os canais oficiais <span aria-hidden="true">↗</span></Link></section>
    </main>
  </PublicPage>;
}
