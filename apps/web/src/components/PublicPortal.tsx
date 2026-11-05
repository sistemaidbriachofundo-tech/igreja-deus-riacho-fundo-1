import Link from "next/link";
import type { ReactNode } from "react";
import { ministries, instagramUrl, type PortalEvent, type PortalMinistry } from "../lib/portal-content";
import { withBasePath } from "../lib/paths";
import s from "./public-portal.module.css";

export { s as portalStyles };

function Logo({ inverse = false }: { inverse?: boolean }) {
  return (
    <Link href="/" className={inverse ? s.brandInverse : s.brand} aria-label="Igreja de Deus no Riacho Fundo I — página inicial">
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
  { href: "/contato/", label: "Contato" },
];

export function PortalHeader({ light = false }: { light?: boolean }) {
  return (
    <header className={light ? s.headerLight : s.header} id="topo">
      <div className={s.headerInner}>
        <Logo inverse={!light} />
        <nav className={s.desktopNav} aria-label="Navegação principal">
          {navigation.map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}
        </nav>
        <div className={s.headerActions}>
          <Link href="/contato/" className={s.headerVisit}>Quero visitar <span aria-hidden="true">↗</span></Link>
          <details className={s.mobileMenu}>
            <summary aria-label="Abrir menu de navegação"><span className={s.menuIcon} aria-hidden="true"><i /><i /></span><span>Menu</span></summary>
            <nav aria-label="Menu mobile" className={s.mobileMenuPanel}>
              <Link href="/">Início</Link>
              {navigation.map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}
              <Link href="/app/">Área interna (demonstração)</Link>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}

export function PortalFooter() {
  return (
    <footer className={s.footer}>
      <div className={s.footerTop}>
        <div className={s.footerAbout}>
          <Logo inverse />
          <p>Uma igreja para Deus, pelas famílias. Um lugar de fé, comunhão e cuidado para cada história.</p>
        </div>
        <div className={s.footerLinks}>
          <div><span className={s.footerLabel}>Explore</span><Link href="/a-igreja/">Nossa igreja</Link><Link href="/ministerios/">Ministérios</Link><Link href="/eventos/">Agenda</Link></div>
          <div><span className={s.footerLabel}>Conecte-se</span><Link href="/contato/">Primeira visita</Link><a href={instagramUrl} rel="noopener noreferrer" target="_blank">Instagram ↗</a><Link href="/ministerios/atmosfera/">Seja voluntário</Link></div>
          <div><span className={s.footerLabel}>Church OS</span><Link href="/app/">Área interna</Link><span className={s.footerNote}>Acesso demonstrativo, com dados fictícios.</span></div>
        </div>
      </div>
      <div className={s.footerBottom}><span>© 2026 Igreja de Deus · Riacho Fundo I</span><span>Fé · Família · Comunhão · Missão</span></div>
    </footer>
  );
}

export function PublicPage({ children, lightHeader = false }: { children: ReactNode; lightHeader?: boolean }) {
  return <div className={s.portal}><a className={s.skipLink} href="#conteudo">Pular para o conteúdo</a><PortalHeader light={lightHeader} />{children}<PortalFooter /></div>;
}

export function Eyebrow({ children, light = false }: { children: ReactNode; light?: boolean }) {
  return <span className={light ? s.eyebrowLight : s.eyebrow}><span className={s.eyebrowDot} />{children}</span>;
}

export function SectionHeading({ eyebrow, title, description, href, linkLabel }: { eyebrow: string; title: string; description?: string; href?: string; linkLabel?: string }) {
  return <div className={s.sectionHeading}><div><Eyebrow>{eyebrow}</Eyebrow><h2>{title}</h2>{description && <p>{description}</p>}</div>{href && <Link href={href} className={s.textLink}>{linkLabel || "Ver mais"} <span aria-hidden="true">↗</span></Link>}</div>;
}

export function MinistryCard({ ministry, featured = false, index }: { ministry: PortalMinistry; featured?: boolean; index: number }) {
  return (
    <Link href={"/ministerios/" + ministry.slug + "/"} className={featured ? s.ministryCardFeatured : s.ministryCard} data-tone={ministry.tone}>
      {ministry.slug === "atmosfera" ? (
        <span className={s.atmosphereArtwork} aria-hidden="true" />
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={withBasePath(ministry.image)} alt="" loading="lazy" className={s.ministryCardImage} />
      )}
      <span className={s.ministryCardShade} />
      <span className={s.ministryCardTop}><span>0{index + 1} / MINISTÉRIOS</span><span aria-hidden="true">↗</span></span>
      <span className={s.ministryCardBottom}><span className={s.ministryCardKicker}>{ministry.eyebrow}</span><strong>{ministry.name}</strong><span className={s.ministryCardSummary}>{ministry.summary}</span></span>
    </Link>
  );
}

export function MinistryGrid({ showAll = true }: { showAll?: boolean }) {
  const items = showAll ? ministries : ministries.slice(0, 3);
  return <div className={s.ministryGrid}>{items.map((ministry, index) => <MinistryCard key={ministry.slug} ministry={ministry} index={index} featured={showAll && index === 0} />)}</div>;
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
  return <section className={s.contactCta}><div className={s.contactCtaHalo} /><div><Eyebrow light>VOCÊ É BEM-VINDO</Eyebrow><h2>{title}</h2><p>{text}</p></div><Link className={s.lightButton} href="/contato/">Quero conhecer a igreja <span aria-hidden="true">↗</span></Link></section>;
}
