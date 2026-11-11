"use client";

import Link from "next/link";
import { useMemo } from "react";
import { PortalSectionLink } from "./PublicSectionLink";
import { instagramUrl } from "../lib/portal-content";
import {
  currentPublishedEvents, formatPortalDate,
  parsePublishedEvents, parsePublishedHome, parsePublishedMinistryDetail,
  type PublishedEvent, type PublishedNews,
} from "../lib/portal-live-data";
import { usePublishedResource } from "../lib/use-published-resource";
import s from "./public-live.module.css";

function EventLine({ event }: { event: PublishedEvent }) {
  const date = formatPortalDate(event.startsAt);
  return (
    <article className={s.eventLine}>
      <div className={s.eventCalendar} aria-label={date.dayAndTime}>
        <strong>{date.day}</strong><span>{date.month}</span>
      </div>
      <div className={s.eventBody}>
        <span className={s.meta}>ENCONTRO CONFIRMADO <span aria-hidden="true">•</span> {date.dayAndTime}</span>
        <h3>{event.name}</h3>
        {event.description && <p>{event.description}</p>}
        {event.locationText && <span className={s.place}>LOCAL: {event.locationText}</span>}
      </div>
      <span className={s.confirmed} aria-label="Publicado pela igreja">✓</span>
    </article>
  );
}

function VisitFallback({ compact = false }: { compact?: boolean }) {
  return <div className={compact ? s.fallbackCompact : s.fallback}>
    <span className={s.fallbackSymbol} aria-hidden="true">✳</span>
    <strong>Programação em atualização</strong>
    <p>Os próximos encontros aparecem aqui quando forem confirmados e publicados pela igreja. Para informações atuais, consulte os canais da comunidade.</p>
    <div className={s.fallbackLinks}>
      <PortalSectionLink sectionId="quem-somos">Conheça nossa igreja <span aria-hidden="true">↗</span></PortalSectionLink>
      <a href={instagramUrl} rel="noopener noreferrer" target="_blank">Acompanhe os avisos <span aria-hidden="true">↗</span></a>
    </div>
  </div>;
}

export function PublishedHomeSpotlight() {
  const { status, data } = usePublishedResource("/public/home", parsePublishedHome);
  const events = data ? currentPublishedEvents(data.featuredEvents).slice(0, 3) : [];
  const news = data?.contentBlocks.filter((item) => item.kind === "NEWS").slice(0, 2) ?? [];
  return (
    <section className={s.spotlight} id="acontece" aria-labelledby="live-home-title">
      <div className={s.spotlightHeading}>
        <div><span className={s.overline}>05 / NOSSA IGREJA EM MOVIMENTO</span><h2 id="live-home-title">O que está <em>acontecendo.</em></h2></div>
        <p>Um espaço para acompanhar a vida da comunidade. Aqui aparecem apenas informações oficialmente publicadas.</p>
      </div>
      <div className={s.spotlightGrid}>
        <div className={s.spotlightAgenda}>
          <div className={s.columnHeading}><span>AGENDA</span><PortalSectionLink sectionId="agenda">Ver programação <span aria-hidden="true">↗</span></PortalSectionLink></div>
          {events.length > 0 ? events.map((event) => <EventLine event={event} key={event.id} />) :
            status === "loading" ? <p className={s.loading} role="status">Consultando programação publicada…</p> :
            <VisitFallback compact />}
        </div>
        <div className={s.spotlightNews}>
          <div className={s.columnHeading}><span>NOTÍCIAS E HISTÓRIAS</span><Link href="/novidades/">Ver novidades <span aria-hidden="true">↗</span></Link></div>
          {news.length > 0 ? news.map((item, index) =>
            <article className={s.newsTeaser} key={item.id}>
              <span className={s.newsNumber}>0{index + 1}</span>
              <div><span className={s.meta}>PUBLICAÇÃO DA IGREJA</span><h3>{item.title}</h3>{item.summary && <p>{item.summary}</p>}</div>
            </article>
          ) : <div className={s.newsEmpty}><strong>Histórias que merecem ser contadas.</strong><p>Notícias e testemunhos autorizados serão publicados aqui. Enquanto isso, conheça a nossa comunidade.</p><PortalSectionLink sectionId="quem-somos">Nossa história <span aria-hidden="true">↗</span></PortalSectionLink></div>}
        </div>
      </div>
    </section>
  );
}

export function PublishedAgenda() {
  const { data } = usePublishedResource("/public/events", parsePublishedEvents);
  const events = useMemo(() => currentPublishedEvents(data ?? []), [data]);

  return (
    <div className={s.visitAgenda}>
      <div>
        <p className={s.visitLabel}>Agenda</p>
        <h2 id="agenda-title" tabIndex={-1}>Cultos de <em>domingo.</em></h2>
        <p className={s.visitIntro}>Venha adorar com a gente no Riacho Fundo I.</p>
      </div>
      <div className={s.visitSchedule}>
        <ul className={s.sundayTimes} aria-label="Horários dos cultos de domingo">
          <li><span>Manhã</span><time dateTime="10:00">10h</time></li>
          <li><span>Noite</span><time dateTime="19:00">19h</time></li>
        </ul>
        {events.length > 0 && (
          <section className={s.upcomingEvents} aria-labelledby="upcoming-events-title">
            <h3 id="upcoming-events-title">Próximos eventos</h3>
            {events.map(event => (
              <article key={event.id} className={s.visitEvent}>
                <time dateTime={event.startsAt}>{formatPortalDate(event.startsAt).dayAndTime}</time>
                <h4>{event.name}</h4>
                {event.locationText && <p>{event.locationText}</p>}
                {event.description && <p>{event.description}</p>}
              </article>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}

export function PublishedMinistryInfo({ slug }: { slug: string }) {
  const { status, data } = usePublishedResource("/public/ministries/" + slug, parsePublishedMinistryDetail);
  const valid = data?.slug === slug ? data : null;
  const upcoming = valid ? currentPublishedEvents(valid.relatedEvents) : [];
  const hasDetails = Boolean(valid && (
    valid.scheduleText || valid.participationInfo || valid.leadership.length || upcoming.length || valid.relatedContent.length || valid.galleryUrls.length || valid.coverImageUrl
  ));
  return (
    <section className={s.ministryLive} aria-label="Informações publicadas pelo ministério">
      <div className={s.ministryLiveHead}>
        <span className={s.overline}>INFORMAÇÕES OFICIAIS</span>
        <h2>Por dentro do <em>ministério.</em></h2>
        <p>Acompanhe as informações aprovadas para publicação pela liderança.</p>
      </div>
      {status === "loading" && <p role="status" className={s.loading}>Consultando informações publicadas…</p>}
      {status !== "loading" && !hasDetails && <div className={s.ministryEmpty}>
        <strong>Detalhes em preparação</strong>
        <p>Equipe, próximos encontros e horários serão exibidos assim que forem confirmados. Você já pode se conectar e conhecer o ministério.</p>
        <Link href={"/visita/?ministerio=" + encodeURIComponent(slug)}>Quero conhecer <span aria-hidden="true">↗</span></Link>
      </div>}
      {hasDetails && valid && <div className={s.ministryLiveGrid}>
        <div>
          {valid.scheduleText && <div className={s.ministryDatum}><span>ENCONTROS</span><p>{valid.scheduleText}</p></div>}
          {valid.participationInfo && <div className={s.ministryDatum}><span>COMO PARTICIPAR</span><p>{valid.participationInfo}</p></div>}
          {valid.leadership.length > 0 && <div className={s.ministryDatum}><span>EQUIPE DE LIDERANÇA</span>
            <ul>{valid.leadership.map((person, i) => <li key={person.displayName + i}><strong>{person.displayName}</strong><small>{person.roleTitle}</small></li>)}</ul>
          </div>}
        </div>
        <div className={s.related}>
          <span className={s.meta}>ATUALIZAÇÕES DO MINISTÉRIO</span>
          {upcoming.map((event) => <EventLine key={event.id} event={event} />)}
          {valid.relatedContent.map((content) => <article key={content.id} className={s.relatedItem}>
            <strong>{content.title}</strong>
            {content.summary && <p>{content.summary}</p>}
          </article>)}
          {!upcoming.length && !valid.relatedContent.length && <p>Novidades e próximos encontros serão publicados aqui.</p>}
        </div>
      </div>}
      {valid && (valid.coverImageUrl || valid.galleryUrls.length > 0) && <div className={s.ministryGallery} aria-label="Imagens publicadas e autorizadas do ministério">
        {[...(valid.coverImageUrl ? [valid.coverImageUrl] : []), ...valid.galleryUrls].slice(0, 6).map((url, index) => (
          <figure key={url + index}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={"Registro autorizado do ministério " + valid.name + " — foto " + (index + 1)} loading="lazy" />
            <figcaption>GALERIA DA COMUNIDADE · FOTO AUTORIZADA</figcaption>
          </figure>
        ))}
      </div>}
    </section>
  );
}

export function PublishedNewsPage() {
  const { status, data } = usePublishedResource("/public/home", parsePublishedHome);
  const news = (data?.contentBlocks ?? []).filter((item) => item.kind === "NEWS");
  return (
    <section className={s.newsPage} aria-labelledby="news-title">
      <div className={s.newsPageIntro}>
        <span className={s.overline}>HISTÓRIAS • COMUNIDADE • NOVIDADES</span>
        <h2 id="news-title">Nossa igreja <em>em movimento.</em></h2>
        <p>Um registro do que Deus está fazendo entre nós, com conteúdos revisados antes da publicação.</p>
      </div>
      {status === "loading" && <p role="status" className={s.loading}>Consultando conteúdos publicados…</p>}
      {status !== "loading" && news.length === 0 && <div className={s.newsEmptyWide}>
        <span aria-hidden="true">✳</span><strong>Nossas próximas histórias começam aqui.</strong>
        <p>Estamos preparando um espaço de notícias da comunidade. Enquanto isso, conheça a igreja e os ministérios.</p>
        <Link href="/ministerios/">Conhecer ministérios <span aria-hidden="true">↗</span></Link>
      </div>}
      {news.length > 0 && <div className={s.newsList}>{news.map((item, i) => <NewsArticle item={item} index={i} key={item.id} />)}</div>}
    </section>
  );
}

function NewsArticle({ item, index }: { item: PublishedNews; index: number }) {
  const date = item.publishedAt ? new Intl.DateTimeFormat("pt-BR", { day:"2-digit", month:"long", year:"numeric",timeZone:"America/Sao_Paulo" }).format(new Date(item.publishedAt)) : null;
  return <details className={s.newsArticle}>
    <summary>
      <span>0{index + 1} / NOTÍCIAS</span>
      <div><h3>{item.title}</h3>{item.summary && <p>{item.summary}</p>}</div>
      <span className={s.newsExpand} aria-hidden="true">+</span>
    </summary>
    <div className={s.newsContent}>
      {item.imageUrl && <figure className={s.articleMedia}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.imageUrl} alt={"Imagem autorizada da publicação " + item.title} loading="lazy" />
      </figure>}
      {date && <span>Publicado em {date}</span>}
      {item.body ? <p>{item.body}</p> : <p>{item.summary ?? "Informações em atualização."}</p>}
    </div>
  </details>;
}
