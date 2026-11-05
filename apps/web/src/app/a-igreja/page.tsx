import Link from "next/link";
import type { Metadata } from "next";
import { withBasePath } from "../../lib/paths";
import { PublicPage, Eyebrow, ContactCTA, portalStyles as s } from "../../components/PublicPortal";

export const metadata: Metadata = {
  title: "A Igreja",
  description: "Conheça a Igreja de Deus no Riacho Fundo I: fé, família, comunhão e serviço.",
};

export default function AboutPage() {
  return <PublicPage>
    <main id="conteudo">
      <section className={s.subhero}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={withBasePath("/images/adoracao-oficial.jpg")} alt="" className={s.subheroImage} />
        <span className={s.subheroOverlay} />
        <div className={s.subheroContent}>
          <div className={s.breadcrumbs}><Link href="/">Início</Link><span>/</span>A Igreja</div>
          <Eyebrow light>NOSSA CASA, SUA CASA</Eyebrow>
          <h1 className={s.subheroTitle}>Fé que se vive. Amor que se compartilha.</h1>
          <p className={s.subheroLead}>Um espaço de acolhimento, adoração, Palavra e comunhão. Conheça o coração da nossa comunidade.</p>
        </div>
      </section>
      <section className={s.mainSection + " " + s.sectionWhite}>
        <div className={s.missionGrid}>
          <div className={s.missionCopy}>
            <Eyebrow>IGREJA DE DEUS · RIACHO FUNDO I</Eyebrow>
            <h2>Construindo juntos uma comunidade de fé.</h2>
            <p>Uma igreja é feita de pessoas que se encontram para adorar, aprender, servir e cuidar umas das outras. Nossa identidade está em Jesus Cristo e nosso convite é simples: venha caminhar conosco.</p>
            <p>Esta apresentação inicial é uma proposta editorial para o novo portal. História institucional, visão pastoral e informações oficiais serão inseridas após validação com a liderança.</p>
            <Link href="/contato/" className={s.textLink}>Como nos conhecer ↗</Link>
          </div>
          <div className={s.missionPhoto}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={withBasePath("/images/comunidade-oficial.jpg")} width={932} height={1180} alt="Comunhão na Igreja de Deus" className={s.missionPhotoFrame} />
            <div className={s.missionBadge}><small>NOSSO CONVITE</small><strong>Venha fazer parte da história.</strong></div>
          </div>
        </div>
      </section>
      <section className={s.mainSection}>
        <div className={s.sectionHeading}><div><Eyebrow>NOSSA CAMINHADA</Eyebrow><h2>Uma fé que toca a vida.</h2><p>Conheça alguns valores que queremos expressar em cada encontro.</p></div></div>
        <div className={s.pillarGrid}>
          <article className={s.pillarCard}><span>01 / FÉ</span><div><h3>Adorar</h3><p>Abrir espaço para a presença de Deus e o aprendizado da Palavra.</p></div></article>
          <article className={s.pillarCard}><span>02 / COMUNHÃO</span><div><h3>Acolher</h3><p>Receber pessoas e histórias com respeito, cuidado e amizade.</p></div></article>
          <article className={s.pillarCard}><span>03 / MISSÃO</span><div><h3>Servir</h3><p>Colocar em prática uma fé que se transforma em cuidado e ação.</p></div></article>
        </div>
      </section>
      <ContactCTA />
    </main>
  </PublicPage>;
}
