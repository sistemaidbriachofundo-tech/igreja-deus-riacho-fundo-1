import Link from "next/link";
import type { Metadata } from "next";
import { portalVisuals } from "../../lib/portal-visuals";
import { PublicPage } from "../../components/PublicPortal";
import { PublishedNewsPage } from "../../components/PublicLiveSections";
import s from "../ministerios/ministry-v3.module.css";

export const metadata: Metadata = {
  title: "Notícias e Histórias",
  description: "Acompanhe notícias, mensagens e histórias publicadas pela Igreja de Deus no Riacho Fundo I.",
};

export default function NewsPage() {
  return <PublicPage>
    <main id="conteudo">
      <section className={s.hubHero} aria-labelledby="news-hero">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={portalVisuals.hero} className={s.hubHeroImage} alt="" fetchPriority="high" />
        <div className={s.hubHeroShade} />
        <div className={s.hubHeroContent}>
          <div className={s.breadcrumb}><Link href="/">INÍCIO</Link> / NOVIDADES</div>
          <span className={s.label}>FÉ QUE ACONTECE NA VIDA REAL</span>
          <h1 id="news-hero">Histórias que<br/><em>nos aproximam.</em></h1>
          <p className={s.hubLead}>Conheça as notícias e histórias que nossa comunidade escolheu compartilhar.</p>
          <a href="#novidades" className={s.hubExplore}>EXPLORAR HISTÓRIAS <span aria-hidden="true">↓</span></a>
        </div>
        <span className={s.photoDisclosure}>IMAGEM ILUSTRATIVA</span>
      </section>
      <div id="novidades"><PublishedNewsPage /></div>
      <section className={s.hubFinal}>
        <span>FÉ • COMUNIDADE • VIDA</span>
        <h2>A sua história <em>também importa.</em></h2>
        <Link href="/visita/">Quero conhecer a igreja <span aria-hidden="true">↗</span></Link>
      </section>
    </main>
  </PublicPage>;
}
