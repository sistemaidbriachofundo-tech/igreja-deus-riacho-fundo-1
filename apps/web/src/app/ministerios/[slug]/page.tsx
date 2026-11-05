import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getMinistry, ministries, events } from "../../../lib/portal-content";
import { withBasePath } from "../../../lib/paths";
import { PublicPage, Eyebrow, EventCard, DemoNote, ContactCTA, portalStyles as s } from "../../../components/PublicPortal";

type MinistryPageProps = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return ministries.map((ministry) => ({ slug: ministry.slug }));
}

export async function generateMetadata({ params }: MinistryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const ministry = getMinistry(slug);
  return {
    title: ministry ? "Ministério " + ministry.name : "Ministérios",
    description: ministry?.summary,
  };
}

export default async function MinistryPage({ params }: MinistryPageProps) {
  const { slug } = await params;
  const ministry = getMinistry(slug);
  if (!ministry) notFound();
  const relatedEvents = events.filter((event) => event.ministry === ministry.slug);

  return (
    <PublicPage>
      <main id="conteudo">
        <section className={s.ministryDetailHero} data-tone={ministry.tone}>
          {ministry.slug === "atmosfera" ? (
            <span className={s.atmosphereArtwork} aria-hidden="true" />
          ) : ministry.slug === "homens" || ministry.slug === "mulheres" ? (
            <span className={s.ministryArtwork} data-tone={ministry.tone} aria-hidden="true"><span>{ministry.name}</span></span>
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={withBasePath(ministry.image)} alt="" className={s.ministryHeroImage} />
          )}
          <span className={s.ministryHeroTint} />
          <div className={s.ministryHeroInner}>
            <div className={s.breadcrumbs}><Link href="/">Início</Link><span>/</span><Link href="/ministerios/">Ministérios</Link><span>/</span>{ministry.name}</div>
            <p className={s.ministryHeroKicker}>{ministry.eyebrow}</p>
            <h1 className={s.ministryHeroTitle}>{ministry.headline}</h1>
            <p className={s.ministryHeroSummary}>{ministry.summary}</p>
            <Link href="/contato/" className={s.primaryButton}>Quero me conectar <span aria-hidden="true">↗</span></Link>
          </div>
        </section>

        <nav className={s.ministryIndex} aria-label="Outros ministérios">
          {ministries.map((item) => <Link key={item.slug} aria-current={item.slug === ministry.slug ? "page" : undefined} href={"/ministerios/" + item.slug + "/"}>{item.name}</Link>)}
        </nav>

        <section className={s.mainSection + " " + s.sectionWhite}>
          <div className={s.ministryIntro}>
            <div><Eyebrow>O QUE NOS MOVE</Eyebrow><h2>{ministry.invitation}</h2></div>
            <div className={s.ministryIntroBody}><p>{ministry.purpose}</p></div>
          </div>
        </section>

        <section className={s.mainSection}>
          <div className={s.sectionHeading}><div><Eyebrow>NOSSA ESSÊNCIA</Eyebrow><h2>Uma caminhada com propósito.</h2><p>Três expressões que inspiram a experiência deste ministério.</p></div></div>
          <div className={s.pillarGrid}>
            {ministry.pillars.map((pillar, index) => <article className={s.pillarCard} key={pillar.title}>
              <span>0{index + 1} / {ministry.name.toUpperCase()}</span>
              <div><h3>{pillar.title}</h3><p>{pillar.description}</p></div>
            </article>)}
          </div>
        </section>

        <section className={s.mainSection + " " + s.sectionMuted} aria-label="Eventos demonstrativos">
          <div className={s.eventListShell}>
            <div className={s.eventAside}><Eyebrow>ENCONTROS</Eyebrow><h2>Vamos nos encontrar?</h2><p>Exemplos de como os eventos deste ministério aparecerão no portal. Programação real será incluída após validação da liderança.</p><DemoNote compact /></div>
            <div className={s.eventList}>{relatedEvents.map((event) => <EventCard key={event.id} event={event} />)}</div>
          </div>
        </section>
        <ContactCTA title={ministry.invitation} text="Entre em contato pelos canais oficiais da igreja para saber como participar e conhecer nossa comunidade." />
      </main>
    </PublicPage>
  );
}
