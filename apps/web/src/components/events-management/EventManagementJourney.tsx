"use client";

import { isAdminEnabled, isProductionAdmin } from "../../lib/admin-environment";
import { useEffect, useState, type FormEvent } from "react";
import { AppShell } from "../AppShell";
import { apiGet, apiPatch, apiPost, getApiBaseUrl, loadStoredToken, type LoginResult } from "../../lib/api";
import { dasError, churchLocalToISO, readDasRows } from "../../lib/das-operations";
import { isSyntheticLabel } from "../../lib/event-registrations";
import {
  canRecordPresence,
  eventSlugFromName,
  participationQuery,
  publicationBlockReason,
  readEventPaymentAccounts,
  readParticipation,
  registrationLabel,
  toManagedEvent,
  toManagedRegistration,
  type EventPaymentAccount,
  type ManagedEvent,
  type ManagedRegistration,
  type ParticipationView,
} from "../../lib/event-management";
import { parseMinistryNav, type MinistryNavItem } from "../../lib/persona-navigation";
import { withBasePath } from "../../lib/paths";
import { eventStatusLabel } from "./calendar";
import { EventRegistrationDesk } from "./EventRegistrationDesk";
import { EventAgenda } from "./EventAgenda";
import s from "./event-management.module.css";

type Phase = "disabled" | "signed-out" | "loading" | "forbidden" | "error" | "ready";
type Draft = { name: string; slug: string; description: string; locationText: string; startsAt: string; ministryId?: string };
const EMPTY: Draft = { name: "", slug: "", description: "", locationText: "", startsAt: "" };

export function EventManagementJourney() {
  const enabled = isAdminEnabled();
  const production = isProductionAdmin();
  const [phase, setPhase] = useState<Phase>(enabled ? "loading" : "disabled");
  const [token, setToken] = useState("");
  const [events, setEvents] = useState<ManagedEvent[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [canReconcile, setCanReconcile] = useState(false);
  const [treasuryOnly, setTreasuryOnly] = useState(false);
  const [leaderMinistries, setLeaderMinistries] = useState<MinistryNavItem[] | null>(null);
  const [paymentAccounts, setPaymentAccounts] = useState<EventPaymentAccount[] | null>(null);
  const [creating, setCreating] = useState<Draft>(EMPTY);
  const [editing, setEditing] = useState<Draft>(EMPTY);
  const [registrations, setRegistrations] = useState<ManagedRegistration[]>([]);
  const [report, setReport] = useState<ParticipationView | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [participant, setParticipant] = useState("TESTE Participante");
  const [partySize, setPartySize] = useState(1);
  const [checkCode, setCheckCode] = useState("");
  const [issuedCode, setIssuedCode] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const stored = loadStoredToken();
    if (!stored) { setPhase("signed-out"); return; }
    let cancelled = false;
    void apiGet<LoginResult["user"]>("/auth/me", stored)
      .then(async user => {
        if (cancelled) return;
        setToken(stored);
        const treasury = user.grants.some(grant => grant.roleCode === "TESOURARIA");
        const churchStaff = user.grants.some(grant => ["PLATFORM_ADMIN", "SECRETARIA", "PASTOR"].includes(grant.roleCode));
        const leader = user.grants.some(grant => grant.roleCode === "LIDER_MINISTERIO");
        const staff = churchStaff || leader;
        setCanReconcile(treasury);
        setTreasuryOnly(treasury && !staff);
        const [body, ministries] = await Promise.all([
          apiGet<unknown>(treasury && !staff ? "/events/conciliacao" : "/events", stored),
          leader && !churchStaff ? apiGet<unknown>("/ministries", stored) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        if (ministries !== null) {
          const options = parseMinistryNav(ministries);
          setLeaderMinistries(options);
          if (options.length === 1) setCreating(draft => ({ ...draft, ministryId: options[0].id }));
        }
        setEvents(readDasRows(body, "events").flatMap((row) => {
          const event = toManagedEvent(row);
          return event ? [event] : [];
        }));
        setPhase("ready");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = dasError(error);
        setNotice(message);
        setPhase(/autorização|403/i.test(message) ? "forbidden" : "error");
      });
    return () => { cancelled = true; };
  }, [enabled]);

  useEffect(() => {
    if (!token || phase !== "ready") return;
    let cancelled = false;
    void apiGet<unknown>("/events/receiving-accounts", token)
      .then(body => { if (!cancelled) setPaymentAccounts(readEventPaymentAccounts(body)); })
      .catch(() => { if (!cancelled) setPaymentAccounts(null); });
    return () => { cancelled = true; };
  }, [token, phase]);

  const selected = events.find((event) => event.id === selectedId) ?? null;
  const blockReason = selected ? publicationBlockReason(selected) : null;

  async function reloadEvents(nextToken = token) {
    const body = await apiGet<unknown>("/events", nextToken);
    const next = readDasRows(body, "events").flatMap((row) => {
      const event = toManagedEvent(row);
      return event ? [event] : [];
    });
    setEvents(next);
    return next;
  }

  async function reloadRegistrations(eventId: string, nextToken = token) {
    const body = await apiGet<unknown>(`/events/${encodeURIComponent(eventId)}/registrations`, nextToken);
    setRegistrations(readDasRows(body, "registrations").flatMap((row) => {
      const registration = toManagedRegistration(row);
      return registration ? [registration] : [];
    }));
  }

  async function run(task: () => Promise<void>) {
    if (busy || !token) return;
    setBusy(true);
    setNotice("");
    try { await task(); }
    catch (error) { setNotice(dasError(error)); }
    finally { setBusy(false); }
  }

  function createDraft(event: FormEvent) {
    event.preventDefault();
    const startsAt = churchLocalToISO(creating.startsAt);
    const slug = creating.slug || eventSlugFromName(creating.name);
    if (creating.name.trim().length < 3 || !/^[a-z0-9-]{3,80}$/.test(slug) || !startsAt) {
      setNotice("Informe nome, identificador e data válidos.");
      return;
    }
    if (leaderMinistries && !leaderMinistries.some(ministry => ministry.id === creating.ministryId)) {
      setNotice("Selecione um dos seus ministérios para cadastrar o evento.");
      return;
    }
    void run(async () => {
      const created = await apiPost<{ id: string }>("/events", token, {
        name: creating.name.trim(),
        slug,
        startsAt,
        description: creating.description.trim() || null,
        locationText: creating.locationText.trim() || null,
        ...(creating.ministryId ? { ministryId: creating.ministryId } : {}),
      });
      setCreating({ ...EMPTY, ministryId: creating.ministryId });
      setNotice("Rascunho gravado. Configure as modalidades e os lotes antes de publicar.");
      const updated = await reloadEvents();
      const draft = updated.find(item => item.id === created.id);
      if (draft) {
        setSelectedId(draft.id);
        setEditing({ name: draft.name, slug: draft.slug, description: draft.description, locationText: draft.locationText, startsAt: "" });
        setRegistrations([]);
        setReport(null);
      }
    });
  }

  function saveDraft(event: FormEvent) {
    event.preventDefault();
    if (!selected || selected.status !== "DRAFT") return;
    const startsAt = editing.startsAt ? churchLocalToISO(editing.startsAt) : null;
    if (editing.startsAt && !startsAt) { setNotice("Data inválida."); return; }
    void run(async () => {
      await apiPatch(`/events/${encodeURIComponent(selected.id)}`, token, {
        name: editing.name.trim(),
        slug: editing.slug.trim(),
        description: editing.description.trim() || null,
        locationText: editing.locationText.trim() || null,
        ...(startsAt ? { startsAt } : {}),
      });
      setNotice("Rascunho atualizado.");
      await reloadEvents();
    });
  }

  function publish() {
    if (!selected || selected.status !== "DRAFT" || blockReason) return;
    void run(async () => {
      await apiPost(`/events/${encodeURIComponent(selected.id)}/publish`, token, {});
      setNotice("Evento publicado. A agenda pública mostra somente o que estiver publicado.");
      await reloadEvents();
    });
  }

  function choose(eventId: string) {
    const event = events.find((item) => item.id === eventId) ?? null;
    setSelectedId(eventId);
    setReport(null);
    setIssuedCode("");
    setRegistrations([]);
    if (!event) return;
    setEditing({
      name: event.name,
      slug: event.slug,
      description: event.description,
      locationText: event.locationText,
      startsAt: "",
    });
    if (event.status === "PUBLISHED" || event.status === "CANCELLED") {
      if (!treasuryOnly) void run(() => reloadRegistrations(eventId));
    }
  }

  function registerSynthetic(event: FormEvent) {
    event.preventDefault();
    if (production || !selected || selected.status !== "PUBLISHED") return;
    if (!isSyntheticLabel(participant) || !Number.isInteger(partySize) || partySize < 1 || partySize > 20) {
      setNotice("Use um rótulo fictício começando por TESTE e uma quantidade inteira.");
      return;
    }
    void run(async () => {
      const modalities = await apiGet<unknown>(`/events/${encodeURIComponent(selected.id)}/modalities`, token);
      let modalityId = readDasRows(modalities, "modalities").map((row) => textId(row.id)).find(Boolean) ?? "";
      if (!modalityId) {
        const created = await apiPost<Record<string, unknown>>(`/events/${encodeURIComponent(selected.id)}/modalities`, token, {
          code: "individual",
          name: "Individual",
          kind: "INDIVIDUAL",
          minPartySize: 1,
          maxPartySize: 20,
        });
        modalityId = textId(created.id);
      }
      if (!modalityId) throw new Error("Não foi possível preparar a inscrição.");
      const response = await apiPost<Record<string, unknown>>(`/events/${encodeURIComponent(selected.id)}/registrations`, token, {
        displayName: participant.trim(),
        modalityId,
        partySize,
        isMinor: false,
      });
      const registration = response.registration && typeof response.registration === "object"
        ? response.registration as Record<string, unknown>
        : response;
      setIssuedCode(typeof registration.checkInCode === "string" ? registration.checkInCode : "");
      setNotice("Inscrição sintética gravada.");
      await reloadRegistrations(selected.id);
    });
  }

  function recordPresence(row: ManagedRegistration) {
    if (!canRecordPresence(row) || checkCode.trim() !== row.checkInCode) {
      setNotice("O código não confere com a inscrição.");
      return;
    }
    void run(async () => {
      await apiPost(`/registrations/${encodeURIComponent(row.id)}/check-in`, token, { checkInCode: checkCode.trim() });
      setCheckCode("");
      setNotice("Presença registrada.");
      if (selected) await reloadRegistrations(selected.id);
    });
  }

  function loadReport(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    void run(async () => {
      const body = await apiGet<unknown>(participationQuery({
        eventId: selected.id,
        status: statusFilter,
        from,
        to,
      }), token);
      const parsed = readParticipation(body);
      if (!parsed) throw new Error("O relatório não trouxe contagens. Nada foi completado nesta tela.");
      setReport(parsed);
      setNotice("Contagens atualizadas.");
    });
  }

  async function download(format: "csv" | "pdf") {
    if (!selected || !token) return;
    setBusy(true);
    setNotice("");
    try {
      const path = participationQuery({ eventId: selected.id, status: statusFilter, from, to })
        .replace("/reports/participation", `/reports/participation.${format}`);
      const response = await fetch(`${getApiBaseUrl()}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`${format.toUpperCase()} falhou (${response.status})`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = format === "csv" ? "participacao.csv" : "participacao.pdf";
      anchor.click();
      URL.revokeObjectURL(url);
      setNotice(format === "csv" ? "Planilha baixada." : "PDF baixado.");
    } catch (error) {
      setNotice(dasError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell active="eventos-gestao" meta="Eventos e presença">
      <EventManagementView
        phase={phase}
        production={production}
        treasuryOnly={treasuryOnly}
        leaderMinistries={leaderMinistries}
        notice={notice}
        events={events}
        selected={selected}
        creating={creating}
        registrationDesk={selected && token && paymentAccounts !== null ? (
          <EventRegistrationDesk key={selected.id} event={selected} token={token}
            accounts={paymentAccounts} canReconcile={canReconcile} canManage={!treasuryOnly}
            onAccountsChanged={async () => setPaymentAccounts(readEventPaymentAccounts(await apiGet("/events/receiving-accounts", token)))} />
        ) : null}
        editing={editing}
        registrations={registrations}
        report={report}
        statusFilter={statusFilter}
        from={from}
        to={to}
        participant={participant}
        partySize={partySize}
        checkCode={checkCode}
        issuedCode={issuedCode}
        busy={busy}
        blockReason={blockReason}
        onCreating={setCreating}
        onEditing={setEditing}
        onCreate={createDraft}
        onSave={saveDraft}
        onPublish={publish}
        onChoose={choose}
        onParticipant={setParticipant}
        onPartySize={setPartySize}
        onRegister={registerSynthetic}
        onCheckCode={setCheckCode}
        onPresence={recordPresence}
        onStatus={setStatusFilter}
        onFrom={setFrom}
        onTo={setTo}
        onReport={loadReport}
        onDownload={(format) => { void download(format); }}
      />
    </AppShell>
  );
}

function textId(value: unknown) {
  return typeof value === "string" ? value : "";
}

export function EventManagementView(props: {
  production?: boolean;
  treasuryOnly?: boolean;
  leaderMinistries?: MinistryNavItem[] | null;
  phase: Phase;
  notice: string;
  events: ManagedEvent[];
  selected: ManagedEvent | null;
  creating: Draft;
  registrationDesk?: React.ReactNode;
  editing: Draft;
  registrations: ManagedRegistration[];
  report: ParticipationView | null;
  statusFilter: string;
  from: string;
  to: string;
  participant: string;
  partySize: number;
  checkCode: string;
  issuedCode: string;
  busy: boolean;
  blockReason: string | null;
  onCreating: (draft: Draft) => void;
  onEditing: (draft: Draft) => void;
  onCreate: (event: FormEvent) => void;
  onSave: (event: FormEvent) => void;
  onPublish: () => void;
  onChoose: (eventId: string) => void;
  onParticipant: (value: string) => void;
  onPartySize: (value: number) => void;
  onRegister: (event: FormEvent) => void;
  onCheckCode: (value: string) => void;
  onPresence: (row: ManagedRegistration) => void;
  onStatus: (value: string) => void;
  onFrom: (value: string) => void;
  onTo: (value: string) => void;
  onReport: (event: FormEvent) => void;
  onDownload: (format: "csv" | "pdf") => void;
}) {
  const published = props.selected?.status === "PUBLISHED";
  return <main className={s.page}>
    <header className={s.header}>
      <div>
        {!props.production && <div className={s.kicker}>HOMOLOGAÇÃO</div>}
        <h1>Agenda, presença e participação</h1>
        <p>Rascunho, revisão, publicação e presença ficam gravados neste ambiente. Menores não aparecem nesta tela.</p>
      </div>
      <div className={s.actions}>
        {props.phase === "ready" && !props.treasuryOnly && <a className={s.primaryLink} href="#novo-evento">Novo evento</a>}
        <a className={s.link} href={withBasePath("/app/relatorios/")}>Relatórios de gestão</a>
      </div>
    </header>
    {props.phase === "disabled" && <p className={s.blocked} role="status">Homologação desabilitada. Nenhum evento foi inventado.</p>}
    {props.phase === "signed-out" && <p className={s.notice} role="status">Entre na área administrativa para operar eventos reais.</p>}
    {props.phase === "loading" && <p className={s.notice} role="status">Consultando eventos autorizados…</p>}
    {props.phase === "forbidden" && <p className={s.blocked} role="alert">{props.notice || "Seu perfil não tem autorização para eventos."}</p>}
    {props.phase === "error" && <p className={s.blocked} role="alert">{props.notice || "Não foi possível consultar os eventos. Nada foi completado nesta tela."}</p>}
    {props.notice && props.phase === "ready" && <p className={s.notice} role="status">{props.notice}</p>}
    {props.phase === "ready" && <>
      <section className={s.panel}>
        <h2>Agenda</h2>
        <EventAgenda events={props.events} selectedId={props.selected?.id ?? ""} onChoose={props.onChoose} />
      </section>
      {!props.treasuryOnly && <form id="novo-evento" className={s.panel} aria-labelledby="novo-evento-titulo" onSubmit={props.onCreate}>
        <h2 id="novo-evento-titulo">Cadastrar evento</h2>
        <div className={s.grid}>
          <label>Nome<input value={props.creating.name} onChange={(event) => props.onCreating({ ...props.creating, name: event.target.value })} required minLength={3} maxLength={140}/></label>
          {props.leaderMinistries && <label>Ministério
            <select required value={props.creating.ministryId ?? ""} onChange={event => props.onCreating({ ...props.creating, ministryId: event.target.value })}>
              <option value="">Selecione seu ministério</option>
              {props.leaderMinistries.map(ministry => <option key={ministry.id} value={ministry.id}>{ministry.name}</option>)}
            </select>
          </label>}
          <label>Endereço do evento (opcional)<input value={props.creating.slug} placeholder={eventSlugFromName(props.creating.name)} onChange={(event) => props.onCreating({ ...props.creating, slug: event.target.value })} pattern="[a-z0-9-]{3,80}" maxLength={80}/></label>
          <label>Início<input type="datetime-local" value={props.creating.startsAt} onChange={(event) => props.onCreating({ ...props.creating, startsAt: event.target.value })} required/></label>
          <label>Local público<input value={props.creating.locationText} onChange={(event) => props.onCreating({ ...props.creating, locationText: event.target.value })} maxLength={180}/></label>
          <label className={s.wide}>Descrição sem dados pessoais<textarea value={props.creating.description} onChange={(event) => props.onCreating({ ...props.creating, description: event.target.value })} maxLength={1200}/></label>
        </div>
        {props.leaderMinistries?.length === 0 && <p className={s.notice}>Seu acesso ainda não está vinculado a um ministério. Fale com a Secretaria.</p>}
        <button type="submit" disabled={props.busy || props.leaderMinistries?.length === 0}>Gravar rascunho</button>
      </form>}
      {!props.treasuryOnly && props.selected && <section className={s.panel}>
        <h2>Revisar e publicar</h2>
        <p className={s.lede}>{props.selected.name} · {eventStatusLabel(props.selected.status)}</p>
        {props.selected.status === "DRAFT" && <form className={s.grid} onSubmit={props.onSave}>
          <label>Nome<input value={props.editing.name} onChange={(event) => props.onEditing({ ...props.editing, name: event.target.value })} required/></label>
          <label>Identificador<input value={props.editing.slug} onChange={(event) => props.onEditing({ ...props.editing, slug: event.target.value })} required pattern="[a-z0-9-]{3,80}"/></label>
          <label>Novo início, se precisar<input type="datetime-local" value={props.editing.startsAt} onChange={(event) => props.onEditing({ ...props.editing, startsAt: event.target.value })}/></label>
          <label>Local<input value={props.editing.locationText} onChange={(event) => props.onEditing({ ...props.editing, locationText: event.target.value })}/></label>
          <label className={s.wide}>Descrição<textarea value={props.editing.description} onChange={(event) => props.onEditing({ ...props.editing, description: event.target.value })}/></label>
          <button type="submit" disabled={props.busy}>Salvar rascunho</button>
        </form>}
        {props.blockReason && <p className={s.blocked} role="alert">{props.blockReason}</p>}
        <button type="button" disabled={props.busy || props.selected.status !== "DRAFT" || Boolean(props.blockReason)} onClick={props.onPublish}>
          {props.production ? "Publicar evento" : "Publicar na homologação"}
        </button>
      </section>}
      {props.registrationDesk}
      {published && props.selected && !props.registrationDesk && !props.treasuryOnly && <section className={s.panel}>
        <h2>Inscrições e presença</h2>
        {!props.production && <form className={s.grid} onSubmit={props.onRegister}>
          <label>Rótulo fictício<input value={props.participant} onChange={(event) => props.onParticipant(event.target.value)} required/></label>
          <label>Pessoas na inscrição<input type="number" min={1} max={20} value={props.partySize} onChange={(event) => props.onPartySize(Number(event.target.value))}/></label>
          <button type="submit" disabled={props.busy}>Inscrever rótulo TESTE</button>
        </form>}
        {props.issuedCode && <p className={s.notice}>Código de check-in desta inscrição adulta: <strong>{props.issuedCode}</strong></p>}
        <div className={s.cards}>
          {props.registrations.map((row) => <article className={s.card} key={row.id}>
            <strong>{registrationLabel(row)}</strong>
            <small>{eventStatusLabel(row.status)} · {row.partySize} {row.partySize === 1 ? "pessoa" : "pessoas"}</small>
            {canRecordPresence(row) && <label>Código de presença<input value={props.checkCode} onChange={(event) => props.onCheckCode(event.target.value)} autoComplete="off"/></label>}
            {canRecordPresence(row) && <button type="button" disabled={props.busy} onClick={() => props.onPresence(row)}>Registrar presença</button>}
          </article>)}
        </div>
      </section>}
      {!props.treasuryOnly && props.selected && <form className={s.panel} onSubmit={props.onReport}>
        <h2>Filtrar e exportar participação</h2>
        <div className={s.grid}>
          <label>Situação<select value={props.statusFilter} onChange={(event) => props.onStatus(event.target.value)}>
            <option value="">Todas</option>
            <option value="CONFIRMED">Confirmadas</option>
            <option value="CHECKED_IN">Com presença</option>
            <option value="PENDING_PAYMENT">Pagamento pendente</option>
            <option value="CANCELLED">Canceladas</option>
          </select></label>
          <label>De<input type="date" value={props.from} onChange={(event) => props.onFrom(event.target.value)}/></label>
          <label>Até<input type="date" value={props.to} onChange={(event) => props.onTo(event.target.value)}/></label>
        </div>
        <div className={s.actions}>
          <button type="submit" disabled={props.busy}>Atualizar contagens</button>
          <button type="button" className={s.secondary} disabled={props.busy || !props.report} onClick={() => props.onDownload("csv")}>Exportar CSV</button>
          <button type="button" className={s.secondary} disabled={props.busy || !props.report} onClick={() => props.onDownload("pdf")}>Exportar PDF</button>
        </div>
        {props.report && <div className={s.counts} aria-label="Contagens de participação">
          <div><strong>{props.report.counts.registrations}</strong><span>Inscrições</span></div>
          <div><strong>{props.report.counts.checkedIn}</strong><span>Presenças</span></div>
          <div><strong>{props.report.counts.participants}</strong><span>Participantes</span></div>
          <div><strong>{props.report.counts.minorsOmitted}</strong><span>Menores omitidos</span></div>
        </div>}
        {props.report && <div className={s.cards}>
          {props.report.rows.map((row) => <article className={s.card} key={row.registrationId}>
            <strong>{row.labelRedacted ? "Rótulo omitido" : row.syntheticLabel || "Sem rótulo"}</strong>
            <small>{eventStatusLabel(row.status)} · {row.partySize}</small>
          </article>)}
          {props.report.counts.minorsOmitted > 0 && <p>Há {props.report.counts.minorsOmitted} inscrição(ões) de menor fora desta lista.</p>}
        </div>}
      </form>}
    </>}
  </main>;
}
