import Link from "next/link";
import type { Metadata } from "next";
import { ministries } from "../../lib/portal-content";
import { portalVisuals, ministryPhoto } from "../../lib/portal-visuals";
import { PublicPage, ContactCTA } from "../../components/PublicPortal";
import s from "./ministry-v3.module.css";

export const metadata: Metadata = {
  title: "Nossos Ministérios",
  description: "Jovens, Homens, Adolescentes, Mulheres e Atmosfera: encontre sua comunidade na Igreja de Deus no Riacho Fundo I.",
};

export default function MinisteriosPage() {
  return (
    <PublicPage>
      <main id="conteudo">
        <section className={s.hubHero} aria-labelledby="hub-title">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={portalVisuals.encounter} alt="" className={s.hubHeroImage} fetchPriority="high" />
          <div className={s.hubHeroShade} />
          <div className={s.hubHeroContent}>
            <div className={s.breadcrumb}><Link href="/">INÍCIO</Link> / MINISTÉRIOS</div>
            <p className={s.label}>UMA IGREJA. MUITAS HISTÓRIAS.</p>
            <h1 id="hub-title">Seu lugar<br/>é <em>aqui.</em></h1>
            <p className={s.hubLead}>Da juventude ao voluntariado, cada ministério é uma oportunidade de compartilhar a fé, crescer e criar laços que permanecem.</p>
            <a href="#conheca" className={s.hubExplore}>CONHEÇA OS MINISTÉRIOS <span aria-hidden="true">↓</span></a>
          </div>
          <span className={s.photoDisclosure}>IMAGEM ILUSTRATIVA</span>
        </section>

        <section className={s.hubIntro} id="conheca" aria-labelledby="hub-intro-title">
          <span>01 / ONDE VOCÊ SE CONECTA</span>
          <h2 id="hub-intro-title">A igreja acontece <em>quando a gente se encontra.</em></h2>
          <p>Conheça cada ministério e encontre um espaço para aprender, compartilhar, fazer amigos e servir. As fotos desta demonstração são ilustrativas.</p>
        </section>

        <div className={s.stories}>
          {ministries.map((ministry,index)=>(
            <section key={ministry.slug} className={s.story} data-tone={ministry.tone} aria-labelledby={`story-${ministry.slug}`}>
              <div className={s.storyPhoto}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={ministryPhoto(ministry.slug)} alt="" loading="lazy" />
                <span>IMAGEM ILUSTRATIVA</span>
              </div>
              <div className={s.storyInfo}>
                <div className={s.storyMeta}><span>0{index+1} / 05</span><span>MINISTÉRIO</span></div>
                <span className={s.storyKicker}>{ministry.eyebrow}</span>
                <h2 id={`story-${ministry.slug}`}>{ministry.name}</h2>
                <p>{ministry.summary}</p>
                <Link href={`/ministerios/${ministry.slug}/`}>Descobrir {ministry.name} <span aria-hidden="true">↗</span></Link>
              </div>
            </section>
          ))}
        </div>

        <section className={s.hubFinal}>
          <span>O MELHOR DA COMUNIDADE É VIVER JUNTO.</span>
          <h2>Você não precisa <em>caminhar sozinho.</em></h2>
          <Link href="/contato/">Comece por uma visita <span aria-hidden="true">↗</span></Link>
        </section>
        <ContactCTA title="Estamos de portas abertas." />
      </main>
    </PublicPage>
  );
}
