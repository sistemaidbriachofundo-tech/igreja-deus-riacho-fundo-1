"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiGetPublic, loadStoredToken } from "../../lib/api";
import {
  loadEventRegistration, loadMemberReceipt, loadMemberRegistrations, memberEventsHref, validEventSlug,
  type MemberRegistrationSummary,
} from "../../lib/public-event-registration";
import { currentPublishedEvents, formatPortalDate, parsePublishedEvents } from "../../lib/portal-live-data";
import { AppNavLink, usePersonaAccess } from "../AppShell";
import { Alert, Button, Loading, PageHeader } from "../ui";
import { EventReceipt, EventRegistrationForm } from "./PublicEventRegistration";
import s from "./public-event-registration.module.css";

const statusLabels: Record<string, string> = {
  CANCELLED: "Cancelada",
  PENDING_PAYMENT: "Aguardando pagamento",
  CONFIRMED: "Confirmada",
  CHECKED_IN: "Presença registrada",
};

function registrationStatus(registration: MemberRegistrationSummary) {
  if (["CANCELLED", "ARCHIVED"].includes(registration.event.status)) return statusLabels.CANCELLED;
  if (registration.status === "CONFIRMED" && registration.guardianAuthStatus === "PENDING") {
    return "Aguardando autorização do responsável";
  }
  return statusLabels[registration.status] ?? "Inscrição registrada";
}

export function MemberEvents() {
  const access = usePersonaAccess();
  const params = useSearchParams();
  const slug = params.get("evento") ?? "";
  const registrationId = params.get("inscricao") ?? "";
  const [data, setData] = useState<Awaited<ReturnType<typeof loadMemberRegistrations>> | null>(null);
  const [events, setEvents] = useState<ReturnType<typeof parsePublishedEvents>>([]);
  const [catalog, setCatalog] = useState<Awaited<ReturnType<typeof loadEventRegistration>>>(null);
  const [receipt, setReceipt] = useState<Awaited<ReturnType<typeof loadMemberReceipt>> | null>(null);
  const [error, setError] = useState("");
  const [revision, reload] = useState(0);
  const [token, setToken] = useState("");

  useEffect(() => {
    if (access.kind !== "ready") return;
    const session = loadStoredToken();
    if (!session) return;
    const activeToken = session;
    let live = true;
    setToken(session);
    setData(null);
    setReceipt(null);
    setCatalog(null);
    setError("");
    async function load() {
      try {
        const [mine, agenda, selectedEvent, selectedRegistration] = await Promise.all([
          loadMemberRegistrations(activeToken),
          slug || registrationId ? null : apiGetPublic<unknown>("/public/events"),
          slug && validEventSlug(slug) ? loadEventRegistration(slug) : null,
          registrationId ? loadMemberReceipt(activeToken, registrationId) : null,
        ]);
        if (!live) return;
        setData(mine);
        setEvents(parsePublishedEvents(agenda) ?? []);
        setCatalog(selectedEvent);
        setReceipt(selectedRegistration);
        if (slug && !selectedEvent) setError("Evento indisponível para inscrição.");
      } catch {
        if (live) setError(registrationId ? "Não foi possível abrir esta inscrição." : "Não foi possível carregar os eventos.");
      }
    }
    void load();
    return () => { live = false; };
  }, [access.kind, access.email, slug, registrationId, revision]);

  const upcoming = currentPublishedEvents(events ?? []);

  return <div className={s.page}>
    <PageHeader appearance="workspace" heading="h1" title="Eventos" />
    {(slug || registrationId) && <AppNavLink className={s.back} href={memberEventsHref()}>Voltar a Eventos e Minhas inscrições</AppNavLink>}
    {error ? <section className={s.panel}>
      <Alert appearance="workspace" tone="danger" title={error} />
      <Button variant="secondary" onClick={() => reload(value => value + 1)}>Tentar novamente</Button>
    </section> : !data ? <Loading label="Carregando eventos" /> : receipt && receipt.id === registrationId ? <>
      <h2>{receipt.eventName}</h2>
      <EventReceipt key={receipt.id} receipt={receipt} memberToken={token} />
    </> : catalog && catalog.event.slug === slug ? <>
      <header className={s.header}>
        <h2>{catalog.event.name}</h2>
        <p>{formatPortalDate(catalog.event.startsAt).dayAndTime}</p>
        {catalog.event.locationText && <p>{catalog.event.locationText}</p>}
        {catalog.event.description && <p>{catalog.event.description}</p>}
      </header>
      <EventRegistrationForm key={slug} catalog={catalog} member={{ token, profile: data.profile }} />
    </> : slug || registrationId ? <Loading label="Carregando detalhes" /> : <>
      <section className={s.panel} aria-labelledby="my-registrations">
        <h2 id="my-registrations">Minhas inscrições</h2>
        {data.registrations.length === 0 ? <p>Você ainda não tem inscrições vinculadas a esta conta.</p> :
          <ul className={s.eventList}>{data.registrations.map(registration => <li key={registration.id}>
            <div><strong>{registration.event.name}</strong><span>{formatPortalDate(registration.event.startsAt).dayAndTime}</span>
              <span>{registrationStatus(registration)}</span></div>
            <AppNavLink href={memberEventsHref() + "?" + new URLSearchParams({ inscricao: registration.id })}>
              Ver inscrição <span className={s.srOnly}>em {registration.event.name}</span>
            </AppNavLink>
          </li>)}</ul>}
      </section>
      <section className={s.panel} aria-labelledby="upcoming-member-events">
        <h2 id="upcoming-member-events">Próximos eventos</h2>
        {upcoming.length === 0 ? <p>Nenhum evento publicado para os próximos dias.</p> :
          <ul className={s.eventList}>{upcoming.map(event => <li key={event.id}>
            <div><strong>{event.name}</strong><span>{formatPortalDate(event.startsAt).dayAndTime}</span>
              {event.locationText && <span>{event.locationText}</span>}</div>
            <AppNavLink href={memberEventsHref(event.slug)}>Ver evento <span className={s.srOnly}>{event.name}</span></AppNavLink>
          </li>)}</ul>}
      </section>
    </>}
  </div>;
}
