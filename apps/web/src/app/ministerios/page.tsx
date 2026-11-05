import Link from "next/link";
import type { Metadata } from "next";
import { PublicPage, Eyebrow, MinistryGrid, ContactCTA, portalStyles as s } from "../../components/PublicPortal";

export const metadata: Metadata = {
  title: "Nossos Ministérios",
  description: "Conheça os ministérios de Jovens, Homens, Adolescentes, Mulheres e Atmosfera da Igreja de Deus no Riacho Fundo I.",
};

export default function MinisteriosPage() {
  return (
    <PublicPage>
      <main id="conteudo">
        <section className={s.subhero + " " + s.fluidMinistriesHero}>
          <span className={s.ministriesBannerArt} aria-hidden="true" />
          <span className={s.subheroOverlay} />
          <div className={s.subheroContent}>
            <div className={s.breadcrumbs}><Link href="/">Início</Link><span>/</span><span>Ministérios</span></div>
            <Eyebrow light>PERTENCER É O COMEÇO</Eyebrow>
            <h1 className={s.subheroTitle}>Um propósito. Muitas formas de viver.</h1>
            <p className={s.subheroLead}>Pessoas de diferentes idades e histórias encontrando comunhão, propósito e oportunidades de servir.</p>
          </div>
        </section>
        <section className={s.mainSection + " " + s.fluidMinistriesSection}>
          <div className={s.sectionHeading}><div><Eyebrow>UMA IGREJA, MUITAS EXPRESSÕES</Eyebrow><h2>Não é sobre encaixar. É sobre pertencer.</h2><p>Explore as páginas dos ministérios e conheça a proposta de cada comunidade.</p></div></div>
          <MinistryGrid />
        </section>
        <section className={s.mainSection + " " + s.sectionWhite}>
          <div className={s.ministryIntro}>
            <div><Eyebrow>CONHEÇA O ATMOSFERA</Eyebrow><h2>Servir também é uma forma de pertencer.</h2></div>
            <div className={s.ministryIntroBody}><p>O Atmosfera reúne o voluntariado da igreja: pessoas que colocam seus dons em ação para acolher, organizar e cuidar. Conheça essa frente e veja como manifestar seu interesse em participar.</p><Link href="/ministerios/atmosfera/" className={s.textLink}>Quero conhecer o Atmosfera ↗</Link></div>
          </div>
        </section>
        <ContactCTA title="Tem lugar para você nesta comunidade." />
      </main>
    </PublicPage>
  );
}
