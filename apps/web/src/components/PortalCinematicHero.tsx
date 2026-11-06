import Link from "next/link";
import { ministries, type MinistrySlug } from "../lib/portal-content";
import { withBasePath } from "../lib/paths";
import { portalVisuals, ministryPhoto } from "../lib/portal-visuals";
import { PortalGlyph, type PortalGlyphName } from "./PortalGlyph";
import s from "./portal-cinematic-hero.module.css";

const railCopy: Record<MinistrySlug, { label: string; icon: PortalGlyphName }> = {
  jovens: { label: "FÉ & PROPÓSITO", icon: "users" },
  mulheres: { label: "COMUNHÃO & CUIDADO", icon: "heart" },
  homens: { label: "CARÁTER & SERVIÇO", icon: "shield" },
  adolescentes: { label: "IDENTIDADE & FÉ", icon: "sparkle" },
  atmosfera: { label: "ACOLHER & SERVIR", icon: "hands" },
};
const railOrder: MinistrySlug[] = ["jovens", "mulheres", "homens", "adolescentes", "atmosfera"];

export function PortalCinematicHero() {
  return (
    <section id="inicio" className={s.hero} aria-labelledby="hero-title">
      <div className={s.visual} aria-hidden="true">
        {/* Genuine image assets in the repository are blended as photographic art direction,
            not evidence of currently scheduled church events. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={portalVisuals.hero} className={s.backdrop} alt="" fetchPriority="high" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={withBasePath("/images/hero-oficial.jpg")} className={s.stagePhoto} alt="" fetchPriority="high" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={withBasePath("/images/adoracao-oficial.jpg")} className={s.worshipPhoto} alt="" fetchPriority="high" />
      </div>
      <div className={s.colorGrade} aria-hidden="true" />
      <div className={s.heroGlow} aria-hidden="true" />
      <div className={s.content}>
        <div className={s.kicker}><span className={s.kickerLine} /> IGREJA DE DEUS <span aria-hidden="true">•</span> RIACHO FUNDO I</div>
        <h1 id="hero-title" className={s.headline}>
          <span>Sua jornada com Deus</span>
          <em>pode começar aqui.</em>
        </h1>
        <p>Um lugar de acolhimento, fé e propósito para você e sua família. Venha nos conhecer e caminhe com uma comunidade que cresce e serve junta.</p>
        <div className={s.actions}>
          <Link href="/visita/" className={s.primaryAction}>
            <PortalGlyph name="calendar" width={19} height={19} />
            <span>Quero visitar</span>
            <PortalGlyph name="arrow" className={s.actionArrow} width={19} height={19} />
          </Link>
          <Link href="/eventos/" className={s.secondaryAction}>
            <PortalGlyph name="calendar" width={19} height={19} />
            <span>Ver agenda</span>
            <PortalGlyph name="arrow" className={s.actionArrow} width={17} height={17} />
          </Link>
        </div>
      </div>
      <div className={s.edgeLight} aria-hidden="true" />
      <div className={s.railWrap}>
        <div className={s.railTopline}>
          <span>FAÇA PARTE DA NOSSA COMUNIDADE</span>
          <Link href="/ministerios/">CONHEÇA OS MINISTÉRIOS <PortalGlyph name="arrow" width={14} height={14} /></Link>
        </div>
        <nav className={s.ministryRail} aria-label="Explorar os cinco ministérios">
          {railOrder.map(slug => {
            const ministry = ministries.find(m => m.slug === slug);
            if (!ministry) return null;
            const info = railCopy[slug];
            return (
              <Link className={s.ministryTile} href={"/ministerios/" + slug + "/"} key={slug} aria-label={"Conhecer ministério " + ministry.name}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={ministryPhoto(slug)} alt="" loading="lazy" />
                <span className={s.tileWash} />
                <span className={s.tileDetail}>
                  <PortalGlyph name={info.icon} width={23} height={23} />
                  <strong>{ministry.name}</strong>
                  <small>{info.label}</small>
                </span>
                <span className={s.tileArrow} aria-hidden="true">↗</span>
              </Link>
            );
          })}
        </nav>
        <p className={s.photoNote}>Composição visual de referência. Fotografias ilustrativas não representam uma programação confirmada.</p>
      </div>
      <a className={s.scrollCue} href="#quem-somos" aria-label="Rolar para conhecer a igreja"><PortalGlyph name="down" width={19} height={19}/></a>
    </section>
  );
}
