import Link from "next/link";
import type { Metadata } from "next";
import { portalVisuals } from "../../lib/portal-visuals";
import { PublicPage } from "../../components/PublicPortal";
import s from "../ministerios/ministry-v3.module.css";

export const metadata: Metadata = {
  title: "A Igreja",
  description: "Conheça a Igreja de Deus no Riacho Fundo I, sua comunidade de fé, acolhimento e serviço.",
};

export default function AboutPage() {
  return <PublicPage>
    <main id="conteudo">
      <section className={s.hubHero}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={portalVisuals.hero} className={s.hubHeroImage} alt="" fetchPriority="high" />
        <div className={s.hubHeroShade} />
        <div className={s.hubHeroContent}>
          <div className={s.breadcrumb}><Link href="/">INÍCIO</Link> / A IGREJA</div>
          <span className={s.label}>NOSSA COMUNIDADE</span>
          <h1>Mais que uma igreja.<br/><em>Uma família.</em></h1>
          <p className={s.hubLead}>Um lugar para adorar a Deus, construir amizades e caminhar em fé, com espaço para cada história.</p>
          <Link href="/eventos/" className={s.hubExplore}>VER AGENDA <span aria-hidden="true">↗</span></Link>
        </div>
        <span className={s.photoDisclosure}>IMAGEM ILUSTRATIVA</span>
      </section>
      <section className={s.detailPurpose}>
        <div><span className={s.label}>01 / NOSSA ESSÊNCIA</span><h2>Gente de verdade.<br/><em>Fé vivida.</em></h2></div>
        <div><p>A igreja é feita de pessoas e de histórias. Queremos receber quem chega com amor e cuidado, fortalecer famílias e construir conexões que vão além dos encontros.</p><p>Esta é a apresentação editorial inicial do portal. História, liderança, visão pastoral e informações institucionais serão incorporadas após validação com a congregação.</p></div>
      </section>
      <section className={s.detailPillars}>
        <div className={s.detailPillarsTitle}><span className={s.label}>02 / O QUE NOS MOVE</span><h2>Uma fé que <em>se vive.</em></h2></div>
        <div className={s.detailPillarsRows}>
          <div className={s.pillarRow}><span>01</span><h3>Adorar</h3><p>Buscar a presença de Deus com sinceridade, Palavra e oração.</p></div>
          <div className={s.pillarRow}><span>02</span><h3>Cuidar</h3><p>Acolher pessoas, fortalecer laços e caminhar juntos.</p></div>
          <div className={s.pillarRow}><span>03</span><h3>Servir</h3><p>Expressar a fé com ações que transformam o nosso entorno.</p></div>
        </div>
      </section>
      <section className={s.hubFinal}><span>UMA CASA ABERTA</span><h2>Essa história <em>também pode ser sua.</em></h2><Link href="/eventos/">Conheça nossa agenda <span aria-hidden="true">↗</span></Link></section>
    </main>
  </PublicPage>;
}
