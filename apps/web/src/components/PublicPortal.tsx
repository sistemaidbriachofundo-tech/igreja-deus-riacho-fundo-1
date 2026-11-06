import Link from "next/link";
import type { ReactNode } from "react";
import { ministries, instagramUrl, type PortalEvent, type PortalMinistry } from "../lib/portal-content";
import { withBasePath } from "../lib/paths";
import s from "./public-portal.module.css";
import { PortalMotion } from "./PortalMotion";
import { MobilePortalMenu } from "./MobilePortalMenu";
import { PortalDesktopNavigation } from "./PortalDesktopNavigation";
import { PortalButton } from "./PortalButton";
import { PortalGlyph } from "./PortalGlyph";
import d from "./portal-design-system.module.css";

export { s as portalStyles };

function Logo({ inverse = false }: { inverse?: boolean }) {
  return (
    <Link href="/" className={`${inverse ? s.brandInverse : s.brand} ${d.brand}`} aria-label="Igreja de Deus no Riacho Fundo I — página inicial">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={withBasePath("/images/logo-igreja-aprovada.webp")} alt="" width={48} height={48} className={s.logo} />
      <span><strong>IGREJA DE DEUS</strong><small>RIACHO FUNDO I</small></span>
    </Link>
  );
}

const navigation = [
  { href: "/a-igreja/", label: "A Igreja" },
  { href: "/ministerios/", label: "Ministérios" },
  { href: "/eventos/", label: "Agenda" },
  { href: "/novidades/", label: "Novidades" },
  { href: "/visita/", label: "Primeira Visita" },
  { href: "/contato/", label: "Contato" },
];

export function PortalHeader({ light = false }: { light?: boolean }) {
  return (
    <header className={d.masthead} id="topo" data-appearance={light ? "light" : "dark"}>
      <div className={d.mastheadInner}>
        <Logo inverse />
        <PortalDesktopNavigation />
        <div className={d.headerControls}>
          <Link href="/visita/" className={d.headerCta} aria-label="Planejar primeira visita"><span className={d.ctaFull}>Participe conosco</span><span className={d.ctaShort}>Visitar</span><PortalGlyph name="arrow" /></Link>
          <MobilePortalMenu links={navigation} />
        </div>
      </div>
    </header>
  );
}

export function PortalFooter() {
  return (
    <footer className={`${s.footer} ${d.footer}`}>
      <div className={s.footerTop}>
        <div className={s.footerAbout}>
          <Logo inverse />
          <p>Uma igreja para Deus, pelas famílias. Um lugar de fé, comunhão e cuidado para cada história.</p>
        </div>
        <div className={s.footerLinks}>
          <div><span className={s.footerLabel}>Explore</span><Link href="/a-igreja/">Nossa igreja</Link><Link href="/ministerios/">Ministérios</Link><Link href="/eventos/">Agenda</Link><Link href="/novidades/">Novidades</Link></div>
          <div><span className={s.footerLabel}>Conecte-se</span><Link href="/visita/">Primeira visita</Link><a href={instagramUrl} rel="noopener noreferrer" target="_blank">Instagram ↗</a><a href="https://www.youtube.com/@IDBRiachoFundo1" rel="noopener noreferrer" target="_blank">YouTube ↗</a><Link href="/ministerios/atmosfera/">Seja voluntário</Link></div>
          <div><span className={s.footerLabel}>Church OS</span><Link href="/app/">Área interna</Link><span className={s.footerNote}>Acesso demonstrativo, com dados fictícios.</span></div>
        </div>
      </div>
      <div className={s.footerBottom}><span>© 2026 Igreja de Deus · Riacho Fundo I</span><span>Fé · Família · Comunhão · Missão</span></div>
    </footer>
  );
}

export function PublicPage({ children, lightHeader = false }: { children: ReactNode; lightHeader?: boolean }) {
  return <div className={`${s.portal} ${d.theme}`}><a className={s.skipLink} href="#conteudo">Pular para o conteúdo</a><PortalHeader light={lightHeader} /><PortalMotion />{children}<PortalFooter /></div>;
}

export function Eyebrow({ children, light = false }: { children: ReactNode; light?: boolean }) {
  return <span className={light ? s.eyebrowLight : s.eyebrow}><span className={s.eyebrowDot} />{children}</span>;
}

export function SectionHeading({ id, eyebrow, title, description, href, linkLabel }: { id?: string; eyebrow: string; title: string; description?: string; href?: string; linkLabel?: string }) {
  return <div className={s.sectionHeading}><div><Eyebrow>{eyebrow}</Eyebrow><h2 id={id}>{title}</h2>{description && <p>{description}</p>}</div>{href && <Link href={href} className={s.textLink}>{linkLabel || "Ver mais"} <span aria-hidden="true">↗</span></Link>}</div>;
}

export function MinistryCard({ ministry, index }: { ministry: PortalMinistry; featured?: boolean; index: number }) {
  const decorativeImage = ministry.slug === "atmosfera" ? (
    <span className={s.atmosphereArtwork} aria-hidden="true" />
  ) : ministry.slug === "homens" || ministry.slug === "mulheres" ? (
    <span className={s.ministryArtwork} data-tone={ministry.tone} aria-hidden="true"><span>{ministry.name}</span></span>
  ) : (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img src={withBasePath(ministry.image)} alt="" loading="lazy" className={s.journeyPortraitImage} />
  );

  return (
    <Link href={"/ministerios/" + ministry.slug + "/"} className={s.ministryJourneyItem} data-tone={ministry.tone}>
      <span className={s.journeyNumber}>0{index + 1}</span>
      <span className={s.journeyName}>
        <span className={s.journeyKicker}>{ministry.eyebrow}</span>
        <strong>{ministry.name}</strong>
      </span>
      <span className={s.journeyPortrait} aria-hidden="true">{decorativeImage}</span>
      <span className={s.journeySummary}>{ministry.summary}</span>
      <span className={s.journeyArrow} aria-hidden="true">↗</span>
    </Link>
  );
}

export function MinistryGrid({ showAll = true }: { showAll?: boolean }) {
  const items = showAll ? ministries : ministries.slice(0, 3);
  return <div className={s.ministryJourney}>{items.map((ministry, index) => <MinistryCard key={ministry.slug} ministry={ministry} index={index} />)}</div>;
}

export function DemoNote({ compact = false }: { compact?: boolean }) {
  return <p className={compact ? s.demoNoteCompact : s.demoNote}><span aria-hidden="true">✳</span> Agenda ilustrativa para avaliação do portal. Datas e eventos não são programação oficial.</p>;
}

export function EventCard({ event }: { event: PortalEvent }) {
  return (
    <article className={s.eventCard}>
      <div className={s.eventDate}><strong>{event.day}</strong><span>{event.month}</span></div>
      <div className={s.eventInfo}><span className={s.eventCategory}>{event.category} <span aria-hidden="true">·</span> {event.time}</span><h3>{event.title}</h3><p>{event.description}</p></div>
      <Link href={event.ministry === "igreja" ? "/contato/" : "/ministerios/" + event.ministry + "/"} className={s.eventArrow} aria-label={"Conhecer " + event.category}><span aria-hidden="true">↗</span></Link>
    </article>
  );
}

export function ContactCTA({ title = "Sua história também tem lugar aqui.", text = "Quer conhecer a igreja ou encontrar um lugar para fazer parte? Comece por aqui." }: { title?: string; text?: string }) {
  return <section className={s.contactCta}><div className={s.contactCtaHalo} /><div><Eyebrow light>VOCÊ É BEM-VINDO</Eyebrow><h2>{title}</h2><p>{text}</p></div><PortalButton href="/visita/" variant="gold">Quero conhecer a igreja</PortalButton></section>;
}
