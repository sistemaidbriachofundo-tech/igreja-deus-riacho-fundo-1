import Link from "next/link";
import type { Metadata } from "next";
import { instagramUrl } from "../../lib/portal-content";
import { portalVisuals } from "../../lib/portal-visuals";
import { PublicPage } from "../../components/PublicPortal";
import s from "../ministerios/ministry-v3.module.css";

export const metadata: Metadata = {
  title: "Contato e Primeira Visita",
  description: "Entre em contato e conheça os canais da Igreja de Deus no Riacho Fundo I.",
};

export default function ContactPage() {
  return <PublicPage>
    <main id="conteudo">
      <section className={s.hubHero}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={portalVisuals.hero} className={s.hubHeroImage} alt="" fetchPriority="high" />
        <div className={s.hubHeroShade} />
        <div className={s.hubHeroContent}>
          <div className={s.breadcrumb}><Link href="/">INÍCIO</Link> / CONTATO</div>
          <span className={s.label}>PRIMEIRA VISITA</span>
          <h1>Você é<br/><em>bem-vindo.</em></h1>
          <p className={s.hubLead}>Não importa de onde você vem. A gente quer que você encontre aqui pessoas para caminhar ao seu lado.</p>
          <a href="#conectar" className={s.hubExplore}>COMO NOS CONECTAR <span aria-hidden="true">↓</span></a>
        </div>
        <span className={s.photoDisclosure}>IMAGEM ILUSTRATIVA</span>
      </section>
      <section className={s.detailPillars} id="conectar">
        <div className={s.detailPillarsTitle}><span className={s.label}>01 / PRÓXIMOS PASSOS</span><h2>Começa com <em>um olá.</em></h2><p>Por enquanto, acompanhe os canais oficiais para confirmar programação e obter informações sobre sua visita.</p></div>
        <div className={s.detailPillarsRows}>
          <div className={s.pillarRow}><span>01</span><h3>Instagram</h3><p><a href={instagramUrl} rel="noopener noreferrer" target="_blank">Acompanhar avisos e falar com a igreja ↗</a></p></div>
          <div className={s.pillarRow}><span>02</span><h3>Ministérios</h3><p><Link href="/ministerios/">Conhecer as áreas da igreja ↗</Link></p></div>
          <div className={s.pillarRow}><span>03</span><h3>Atmosfera</h3><p><Link href="/ministerios/atmosfera/">Conhecer o voluntariado ↗</Link></p></div>
        </div>
      </section>
      <section className={s.detailPurpose}>
        <div><span className={s.label}>02 / INFORMAÇÕES OFICIAIS</span><h2>Estamos preparando <em>tudo para receber você.</em></h2></div>
        <div><p>O endereço completo, horários de cultos e contatos serão apresentados aqui após validação institucional. Não vamos inventar essas informações nem coletar dados pessoais por formulários demonstrativos.</p></div>
      </section>
    </main>
  </PublicPage>;
}
