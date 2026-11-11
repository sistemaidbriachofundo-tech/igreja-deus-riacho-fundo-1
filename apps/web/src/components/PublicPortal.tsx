import Link from "next/link";
import type { ReactNode } from "react";
import { instagramUrl, ministries, type PortalEvent, type PortalMinistry } from "../lib/portal-content";
import { withBasePath } from "../lib/paths";
import s from "./public-portal.module.css";
import { PortalMotion } from "./PortalMotion";
import { MobilePortalMenu } from "./MobilePortalMenu";
import { PortalDesktopNavigation } from "./PortalDesktopNavigation";
import { PortalButton } from "./PortalButton";
import { PublicHashFocus, PortalSectionLink } from "./PublicSectionLink";
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
  { href: "/#inicio", label: "Início" },
  { href: "/#quem-somos", label: "Quem somos" },
  { href: "/#agenda", label: "Agenda" },
];

export function PortalHeader({ light = false }: { light?: boolean }) {
  return (
    <header className={d.masthead} id="topo" data-appearance={light ? "light" : "dark"}>
      <div className={d.mastheadInner}>
        <Logo inverse />
        <PortalDesktopNavigation />
        <div className={d.headerControls}>
          <Link href="/login/" className={d.headerLogin} aria-label="Login ID Riacho 1 — abrir tela de e-mail e senha" title="Entrar na plataforma ID Riacho 1">Login</Link>
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
          <p>Riacho Fundo I · Brasília, DF</p>
        </div>
        <nav className={s.footerLinks} aria-label="Navegação do rodapé">
          <div><span className={s.footerLabel}>Navegue</span>
            <PortalSectionLink sectionId="inicio">Início</PortalSectionLink>
            <PortalSectionLink sectionId="quem-somos">Quem somos</PortalSectionLink>
            <PortalSectionLink sectionId="agenda">Agenda</PortalSectionLink>
          </div>
          <div><span className={s.footerLabel}>Acesso</span>
            <Link href="/login/">Login</Link>
            <a href={instagramUrl} target="_blank" rel="noopener noreferrer">Instagram da igreja ↗</a>
          </div>
        </nav>
      </div>
      <div className={s.footerBottom}><span>© 2026 Igreja de Deus · Riacho Fundo I</span></div>
    </footer>
  );
}

export function PublicPage({ children, lightHeader = false }: { children: ReactNode; lightHeader?: boolean }) {
  return <div className={`${s.portal} ${d.theme}`}><a className={s.skipLink} href="#conteudo">Pular para o conteúdo</a><PortalHeader light={lightHeader} /><PublicHashFocus /><PortalMotion />{children}<PortalFooter /></div>;
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
