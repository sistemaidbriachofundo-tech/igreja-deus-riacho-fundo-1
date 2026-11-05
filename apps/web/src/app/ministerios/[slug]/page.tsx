import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getMinistry, ministries, events } from "../../../lib/portal-content";
import { ministryPhoto } from "../../../lib/portal-visuals";
import { PublicPage, EventCard, DemoNote, ContactCTA } from "../../../components/PublicPortal";
import s from "../ministry-v3.module.css";

type MinistryPageProps = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return ministries.map((ministry) => ({ slug: ministry.slug }));
}

export async function generateMetadata({ params }: MinistryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const ministry = getMinistry(slug);
  return { title: ministry ? "Ministério " + ministry.name : "Ministérios", description: ministry?.summary };
}

export default async function MinistryPage({ params }: MinistryPageProps) {
  const { slug } = await params;
  const ministry = getMinistry(slug);
  if (!ministry) notFound();
  const relatedEvents = events.filter(event => event.ministry === ministry.slug);

  return (
    <PublicPage>
      <main id="conteudo">
        <section className={s.detailHero} data-tone={ministry.tone}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ministryPhoto(ministry.slug)} alt="" className={s.detailHeroPhoto} fetchPriority="high" />
          <div className={s.detailHeroFade} />
          <div className={s.detailHeroContent}>
            <div className={s.breadcrumb}><Link href="/">INÍCIO</Link> / <Link href="/ministerios/">MINISTÉRIOS</Link> / {ministry.name.toUpperCase()}</div>
            <span className={s.label}>{ministry.eyebrow}</span>
            <h1>{ministry.headline}</h1>
            <p>{ministry.summary}</p>
            <Link href="/contato/" className={s.detailHeroButton}>Quero participar <span aria-hidden="true">↗</span></Link>
          </div>
          <span className={s.photoDisclosure}>IMAGEM ILUSTRATIVA</span>
        </section>
        <nav className={s.detailNav} aria-label="Outros ministérios">
          {ministries.map(item => <Link key={item.slug} aria-current={item.slug === ministry.slug ? "page" : undefined} href={`/ministerios/${item.slug}/`}>{item.name}</Link>)}
        </nav>
        <section className={s.detailPurpose}>
          <div><span className={s.label}>01 / NOSSA MISSÃO</span><h2>Todo mundo tem <em>um lugar na história.</em></h2></div>
          <div><p>{ministry.purpose}</p><p>{ministry.invitation}</p></div>
        </section>
        <section className={s.detailPillars}>
          <div className={s.detailPillarsTitle}><span className={s.label}>02 / NOSSA ESSÊNCIA</span><h2>O que nos <em>move.</em></h2></div>
          <div className={s.detailPillarsRows}>
            {ministry.pillars.map((pillar,index) => (
              <div key={pillar.title} className={s.pillarRow}><span>0{index+1}</span><h3>{pillar.title}</h3><p>{pillar.description}</p></div>
            ))}
          </div>
        </section>
        <section className={s.detailEvents} aria-label="Eventos demonstrativos">
          <div><span className={s.label}>03 / VIDA EM COMUNIDADE</span><h2>Vamos nos <em>encontrar?</em></h2><p>Esta é uma prévia visual. Os eventos abaixo são fictícios, aguardando a integração com a agenda oficial da igreja.</p><DemoNote compact /></div>
          <div>{relatedEvents.map(event => <EventCard key={event.id} event={event}/>)}</div>
        </section>
        <ContactCTA title={ministry.invitation} text="Acompanhe os canais oficiais da igreja para saber mais e encontrar a sua comunidade." />
      </main>
    </PublicPage>
  );
}
