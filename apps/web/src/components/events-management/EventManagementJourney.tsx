"use client";

import { isAdminEnabled, isProductionAdmin } from "../../lib/admin-environment";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { PageHeader } from "../ui/PageHeader";
import ui from "../ui/ui.module.css";
import { AppShell } from "../AppShell";
import { UIIcon } from "../ui/UIIcon";
import { apiGet, apiPatch, apiPost, getApiBaseUrl, loadStoredToken, type LoginResult } from "../../lib/api";
import { dasError, churchLocalToISO, readDasRows } from "../../lib/das-operations";
import { isSyntheticLabel } from "../../lib/event-registrations";
import {
  canRecordPresence,
  generateEventCode,
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
import { formatPortalDate } from "../../lib/portal-live-data";
import { eventStatusLabel } from "./calendar";
import { EventRegistrationDesk } from "./EventRegistrationDesk";
import { EventRosterDesk } from "./EventRosterDesk";
import { EventAgenda } from "./EventAgenda";
import s from "./event-management.module.css";

type Phase = "disabled" | "signed-out" | "loading" | "forbidden" | "error" | "ready";
type Draft = { name: string; slug: string; description: string; locationText: string; startsAt: string; ministryId?: string };
const EMPTY: Draft = { name: "", slug: "", description: "", locationText: "", startsAt: "" };

function revealEventCreation() {
  const panel = document.querySelector<HTMLDetailsElement>("details#novo-evento");
  if (!panel) return;
  panel.open = true;
  panel.scrollIntoView({ block: "start" });
  panel.querySelector("input")?.focus({ preventScroll: true });
}

function closeEventCreation() {
  const panel = document.querySelector<HTMLDetailsElement>("details#novo-evento");
  if (panel) panel.open = false;
  if (window.location.hash === "#novo-evento") {
    const url = new URL(window.location.href);
    url.hash = "";
    window.history.replaceState(window.history.state, "", url);
  }
}

function cancelEventCreation() {
  closeEventCreation();
  document.getElementById("acao-novo-evento")?.focus();
}

export function EventManagementJourney() {
  const enabled = isAdminEnabled();
  const production = isProductionAdmin();
  const [phase, setPhase] = useState<Phase>(enabled ? "loading" : "disabled");
  const [token, setToken] = useState("");
  const [viewer, setViewer] = useState<LoginResult["user"]>();
  const [events, setEvents] = useState<ManagedEvent[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [canReconcile, setCanReconcile] = useState(false);
  useEffect(() => {
    if (phase !== "ready") return;
    const openCreation = () => {
      if (window.location.hash !== "#novo-evento") return;
      const url = new URL(window.location.href);
      if (url.searchParams.has("evento")) {
        url.searchParams.delete("evento");
        window.history.replaceState(window.history.state, "", url);
      }
      setSelectedId("");
      requestAnimationFrame(revealEventCreation);
    };
    openCreation();
    window.addEventListener("hashchange", openCreation);
    return () => window.removeEventListener("hashchange", openCreation);
  }, [phase]);
  const [treasuryOnly, setTreasuryOnly] = useState(false);
  const [ministryOptions, setMinistryOptions] = useState<MinistryNavItem[]>([]);
  const [ministryRequired, setMinistryRequired] = useState(false);
  const selectedHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!selectedId) return;
    selectedHeading.current?.focus({ preventScroll: true });
    selectedHeading.current?.scrollIntoView({ block: "start" });
  }, [selectedId]);
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
        setViewer(user);
        const treasury = user.grants.some(grant => grant.roleCode === "TESOURARIA");
        const churchStaff = user.grants.some(grant => ["PLATFORM_ADMIN", "SECRETARIA", "PASTOR"].includes(grant.roleCode));
        const leader = user.grants.some(grant => grant.roleCode === "LIDER_MINISTERIO");
        const staff = churchStaff || leader;
        setCanReconcile(treasury);
        setTreasuryOnly(treasury && !staff);
        setMinistryRequired(leader && !churchStaff);
        const [body, ministries] = await Promise.all([
          apiGet<unknown>(treasury && !staff ? "/events/conciliacao" : "/events", stored),
          staff ? apiGet<unknown>("/ministries", stored).catch(() => null) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        if (ministries !== null) {
          const options = parseMinistryNav(ministries);
          setMinistryOptions(options);
          if (leader && !churchStaff && options.length === 1) setCreating(draft => ({ ...draft, ministryId: options[0].id }));
        }
        const available = readDasRows(body, "events").flatMap((row) => {
          const event = toManagedEvent(row);
          return event ? [event] : [];
        });
        setEvents(available);
        const fromMinistry = new URLSearchParams(window.location.search).get("evento");
        const requested = available.find(event => event.id === fromMinistry);
        if (requested) {
          setEditing({ name: requested.name, slug: requested.slug, description: requested.description, locationText: requested.locationText, startsAt: "" });
          setSelectedId(requested.id);
        }
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
  const selectedStatus = selected?.status;

  useEffect(() => {
    if (!token || treasuryOnly || (selectedStatus !== "PUBLISHED" && selectedStatus !== "CANCELLED")) return;
    let active = true;
    void loadRegistrations(selectedId, token).then(rows => {
      if (active) setRegistrations(rows);
    }).catch(error => {
      if (active) setNotice(dasError(error));
    });
    return () => { active = false; };
  }, [selectedId, selectedStatus, token, treasuryOnly]);

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
    setRegistrations(await loadRegistrations(eventId, nextToken));
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
    if (creating.name.trim().length < 3 || !startsAt) {
      setNotice("Informe o nome, a data e o horário de início do evento.");
      return;
    }
    if ((ministryRequired || creating.ministryId) && !ministryOptions.some(ministry => ministry.id === creating.ministryId)) {
      setNotice("Selecione um dos seus ministérios para cadastrar o evento.");
      return;
    }
    void run(async () => {
      const slug = generateEventCode(creating.name);
      const created = await apiPost<{ id: string }>("/events", token, {
        name: creating.name.trim(),
        slug,
        startsAt,
        description: creating.description.trim() || null,
        locationText: creating.locationText.trim() || null,
        ...(creating.ministryId ? { ministryId: creating.ministryId } : {}),
      });
      setCreating({ ...EMPTY, ministryId: creating.ministryId });
      closeEventCreation();
      setNotice("Rascunho salvo. Se o evento tiver inscrições, configure os tipos e as vagas antes de publicar.");
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
    if (!/^[a-z0-9-]{3,80}$/.test(editing.slug.trim())) {
      setNotice("Confira o final do link da inscrição. Use letras minúsculas, números e hífens.");
      return;
    }
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
    if (eventId === selectedId) {
      selectedHeading.current?.focus({ preventScroll: true });
      selectedHeading.current?.scrollIntoView({ block: "start" });
      return;
    }
    const event = events.find((item) => item.id === eventId) ?? null;
    setNotice("");
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
  }

  function returnToAgenda() {
    setSelectedId("");
    setNotice("");
    const url = new URL(window.location.href);
    url.searchParams.delete("evento");
    url.hash = "agenda-de-eventos";
    window.history.replaceState(window.history.state, "", url);
    requestAnimationFrame(() => document.getElementById("titulo-agenda-eventos")?.focus());
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
        ministryOptions={ministryOptions}
        ministryRequired={ministryRequired}
        selectedHeading={selectedHeading}
        notice={notice}
        events={events}
        selected={selected}
        creating={creating}
        rosterDesk={selected && viewer && token && !treasuryOnly ? (
          <EventRosterDesk key={selected.id} event={selected} token={token} viewer={viewer} />
        ) : null}
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
        onReturnToAgenda={returnToAgenda}
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

async function loadRegistrations(eventId: string, token: string) {
  const body = await apiGet<unknown>("/events/" + encodeURIComponent(eventId) + "/registrations", token);
  return readDasRows(body, "registrations").flatMap(row => {
    const registration = toManagedRegistration(row);
    return registration ? [registration] : [];
  });
}

function textId(value: unknown) {
  return typeof value === "string" ? value : "";
}

export function EventManagementView(props: {
  production?: boolean;
  treasuryOnly?: boolean;
  leaderMinistries?: MinistryNavItem[] | null;
  ministryOptions?: MinistryNavItem[];
  ministryRequired?: boolean;
  selectedHeading?: React.RefObject<HTMLHeadingElement | null>;
  phase: Phase;
  notice: string;
  events: ManagedEvent[];
  selected: ManagedEvent | null;
  creating: Draft;
  registrationDesk?: React.ReactNode;
  rosterDesk?: React.ReactNode;
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
  onReturnToAgenda?: () => void;
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
  return <div className={s.page}>
    <PageHeader appearance="workspace" heading="h1" title="Gestão de eventos"
      description={props.selected ? undefined : "Veja a agenda, cadastre eventos e acompanhe as inscrições."}
      actions={<>
        {props.phase === "ready" && !props.treasuryOnly && !props.selected && <a id="acao-novo-evento" className={ui.workspacePrimary} href="#novo-evento" onClick={revealEventCreation}><UIIcon name="plus" size={18} /> Novo evento</a>}
        <a className={ui.workspaceSecondary} href={withBasePath("/app/relatorios/")}><UIIcon name="activity" size={18} /> Relatórios de gestão</a>
      </>} />
    {props.phase === "disabled" && <p className={s.blocked} role="status">O acesso à gestão de eventos está indisponível neste endereço.</p>}
    {props.phase === "signed-out" && <p className={s.notice} role="status">Entre com sua conta para organizar eventos.</p>}
    {props.phase === "loading" && <p className={s.notice} role="status">Consultando eventos autorizados…</p>}
    {props.phase === "forbidden" && <p className={s.blocked} role="alert">{props.notice || "Seu perfil não tem autorização para eventos."}</p>}
    {props.phase === "error" && <p className={s.blocked} role="alert">{props.notice || "Não foi possível consultar os eventos. Tente novamente."}</p>}
    {props.notice && props.phase === "ready" && <p className={s.notice} role="status">{props.notice}</p>}
    {props.phase === "ready" && <>
      {!props.treasuryOnly && <details id="novo-evento" className={s.createPanel} hidden={Boolean(props.selected)}>
        <summary aria-label="Fechar cadastro de evento" onClick={event => { event.preventDefault(); cancelEventCreation(); }}>
          <UIIcon name="plus" size={18} /> Cadastrar evento <span className={s.closeCreation}><UIIcon name="close" size={19} /></span>
        </summary>
        <form className={s.panel} aria-label="Cadastrar evento" onSubmit={props.onCreate}>
          <div className={s.grid}>
            <label>Nome<input placeholder="Ex. Encontro de jovens" value={props.creating.name} onChange={(event) => props.onCreating({ ...props.creating, name: event.target.value })} required minLength={3} maxLength={140}/></label>
            {(props.ministryOptions || props.leaderMinistries) && <label>Ministério responsável
              <select required={props.ministryRequired ?? Boolean(props.leaderMinistries)} value={props.creating.ministryId ?? ""} onChange={event => props.onCreating({ ...props.creating, ministryId: event.target.value })}>
                <option value="">{props.ministryRequired ? "Selecione seu ministério" : "Evento da congregação"}</option>
                {(props.ministryOptions ?? props.leaderMinistries ?? []).map(ministry => <option key={ministry.id} value={ministry.id}>{ministry.name}</option>)}
              </select>
            </label>}
            <label>Data e horário de início<input type="datetime-local" value={props.creating.startsAt} onChange={(event) => props.onCreating({ ...props.creating, startsAt: event.target.value })} required/></label>
            <label>Local do evento<input placeholder="Ex. Auditório da igreja" value={props.creating.locationText} onChange={(event) => props.onCreating({ ...props.creating, locationText: event.target.value })} maxLength={180}/></label>
            <label className={s.wide}>Descrição para a agenda<textarea value={props.creating.description} onChange={(event) => props.onCreating({ ...props.creating, description: event.target.value })} maxLength={1200}/></label>
          </div>
          {props.ministryRequired && !props.ministryOptions?.length && <p className={s.notice}>Seu acesso ainda não está vinculado a um ministério. Fale com a Secretaria.</p>}
          <p className={s.creationHint}>O link da inscrição é gerado a partir do nome. Você pode configurar as vagas e revisar o evento antes de publicar.</p>
          <div className={s.actions}>
            <button type="submit" disabled={props.busy || (props.ministryRequired && !props.ministryOptions?.length)}>Salvar rascunho</button>
            <button type="button" className={s.secondary} onClick={cancelEventCreation}>Voltar à agenda</button>
          </div>
        </form>
      </details>}
      <section className={`${s.panel} ${s.agendaPanel}`} id="agenda-de-eventos" hidden={Boolean(props.selected)}>
        <h2 className={s.agendaHeading} id="titulo-agenda-eventos" tabIndex={-1}><span className={s.agendaMark}><UIIcon name="calendar" size={23} /></span>Agenda</h2>
        <EventAgenda events={props.events} selectedId={props.selected?.id ?? ""} onChoose={props.onChoose} />
      </section>
      {props.selected && <section className={`${s.panel} ${s.eventDetail}`} aria-labelledby="evento-aberto">
        <a className={s.backToAgenda} href="#agenda-de-eventos" onClick={event => {
          if (props.onReturnToAgenda) { event.preventDefault(); props.onReturnToAgenda(); }
        }}>← Voltar à agenda de eventos</a>
        <div>
          <h2 id="evento-aberto" className={s.detailHeading} tabIndex={-1} ref={props.selectedHeading}>{props.selected.name}</h2>
          <p className={s.lede}><span className={s.agendaTag} data-status={props.selected.status}>{eventStatusLabel(props.selected.status)}</span> · {formatPortalDate(props.selected.startsAt).dayAndTime}
            {props.selected.locationText && " · " + props.selected.locationText}</p>
        </div>
        <nav className={s.eventLinks} aria-label="Seções do evento">
          {!props.treasuryOnly && <a href="#revisar-evento"><UIIcon name="calendar" size={20} /><span>{props.selected.status === "DRAFT" ? "Dados e publicação" : "Dados do evento"}</span></a>}
          {props.registrationDesk && <a href="#inscricoes-do-evento"><UIIcon name={props.treasuryOnly ? "wallet" : "check"} size={20} /><span>{props.treasuryOnly ? "Pix do evento" : "Inscrições e presença"}</span></a>}
          {props.rosterDesk && <a href="#escala-do-evento" onClick={() => {
            const roster = document.querySelector<HTMLDetailsElement>("details#escala-do-evento");
            if (roster) roster.open = true;
          }}><UIIcon name="people" size={20} /><span>Escala da equipe</span></a>}
        </nav>
      </section>}
      {!props.treasuryOnly && props.selected && <section className={s.panel} id="revisar-evento">
        <h2>{props.selected.status === "DRAFT" ? "Dados e publicação" : "Dados do evento"}</h2>
        {props.selected.status !== "DRAFT" && !props.blockReason && props.selected.description && <p className={s.lede}>{props.selected.description}</p>}
        {props.selected.status === "DRAFT" && <form className={s.grid} onSubmit={props.onSave}>
          <label>Nome<input value={props.editing.name} onChange={(event) => props.onEditing({ ...props.editing, name: event.target.value })} required/></label>
          <label>Novo início, se precisar<input type="datetime-local" value={props.editing.startsAt} onChange={(event) => props.onEditing({ ...props.editing, startsAt: event.target.value })}/></label>
          <label>Local<input value={props.editing.locationText} onChange={(event) => props.onEditing({ ...props.editing, locationText: event.target.value })}/></label>
          <label className={s.wide}>Descrição<textarea value={props.editing.description} onChange={(event) => props.onEditing({ ...props.editing, description: event.target.value })}/></label>
          <details className={`${s.wide} ${s.linkSettings}`}>
            <summary>Personalizar link da inscrição</summary>
            <label>Final do link<input value={props.editing.slug} onChange={(event) => props.onEditing({ ...props.editing, slug: event.target.value })} required pattern={"[a-z0-9\\-]{3,80}"} maxLength={80} />
              <small>O último trecho do endereço que você compartilha. Exemplo: encontro-de-jovens.</small>
            </label>
          </details>
          <div className={`${s.wide} ${s.actions}`}><button type="submit" disabled={props.busy}>Salvar alterações</button></div>
        </form>}
        {props.blockReason && <p className={s.blocked} role="alert">{props.blockReason}</p>}
        <button type="button" disabled={props.busy || props.selected.status !== "DRAFT" || Boolean(props.blockReason)} onClick={props.onPublish}>
          {props.production ? "Publicar evento" : "Publicar na homologação"}
        </button>
      </section>}
      {props.rosterDesk}
      {props.registrationDesk && <div id="inscricoes-do-evento">{props.registrationDesk}</div>}
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
  </div>;
}
