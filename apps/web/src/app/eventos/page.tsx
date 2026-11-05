import Link from "next/link";
import type { Metadata } from "next";
import { events } from "../../lib/portal-content";
import { withBasePath } from "../../lib/paths";
import { PublicPage, Eyebrow, DemoNote, ContactCTA, portalStyles as s } from "../../components/PublicPortal";
import { EventFilter } from "../../components/EventFilter";

export const metadata: Metadata = {
  title: "Agenda",
  description: "Conheça o modelo de agenda e eventos da Igreja de Deus no Riacho Fundo I. Programação demonstrativa, sujeita a confirmação.",
};

export default function EventsPage() {
  return <PublicPage>
    <main id="conteudo">
      <section className={s.subhero}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={withBasePath("/images/hero-oficial.jpg")} alt="" className={s.subheroImage} />
        <span className={s.subheroOverlay} />
        <div className={s.subheroContent}>
          <div className={s.breadcrumbs}><Link href="/">Início</Link><span>/</span>Agenda</div>
          <Eyebrow light>ENCONTROS E EXPERIÊNCIAS</Eyebrow>
          <h1 className={s.subheroTitle}>Há histórias que começam em um encontro.</h1>
          <p className={s.subheroLead}>Uma visão da futura agenda integrada da igreja e dos ministérios.</p>
        </div>
      </section>
      <section className={s.mainSection + " " + s.sectionWhite}>
        <div className={s.eventListShell}>
          <div className={s.eventAside}>
            <Eyebrow>AGENDA DO PORTAL</Eyebrow>
            <h2>Próximos encontros.</h2>
            <p>Esta é a estrutura visual da agenda. Os eventos, horários e datas são fictícios e servem exclusivamente para testar a experiência.</p>
            <DemoNote />
          </div>
          <EventFilter events={events} />
        </div>
      </section>
      <section className={s.mainSection + " " + s.sectionMuted}>
        <div className={s.ministryIntro}>
          <div><Eyebrow>QUER SABER O QUE É OFICIAL?</Eyebrow><h2>Acompanhe a programação confirmada.</h2></div>
          <div className={s.ministryIntroBody}><p>Enquanto conectamos a agenda ao backend, confirme datas e horários nos canais oficiais da congregação. Este portal não aceita inscrições para os eventos demonstrativos.</p><Link href="/contato/" className={s.textLink}>Canais de contato ↗</Link></div>
        </div>
      </section>
      <ContactCTA />
    </main>
  </PublicPage>;
}
