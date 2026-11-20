"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ApiRequestError, clearToken, isInvalidSession, loadStoredToken } from "../../lib/api";
import {
  availableEventLots, cancelMemberRegistration, eventRegistrationChoices, loadEventRegistration, loadMemberReceipt,
  eventAuthHref, loadMemberRegistrations, memberEventsHref, registerForEvent,
  type MemberEventProfile, type RegistrationReceipt,
} from "../../lib/public-event-registration";
import { formatPortalDate, type PublishedEvent } from "../../lib/portal-live-data";
import { withBasePath } from "../../lib/paths";
import { PublicPage } from "../PublicPortal";
import { Alert, Button, Input, Loading, Select } from "../ui";
import { useActionConfirmation } from "../ui/ActionConfirmation";
import { UIIcon } from "../ui/UIIcon";
import { formatEventPrice } from "./EventRegistrationDesk";
import s from "./public-event-registration.module.css";

type Catalog = NonNullable<Awaited<ReturnType<typeof loadEventRegistration>>>;

function message(error: unknown): string {
  const status = error instanceof ApiRequestError ? error.status : null;
  if (status === 401) return "Sua sessão expirou. Entre novamente para se inscrever.";
  if (status === 404) return "Este evento não está disponível para inscrição.";
  if (status === 400 || status === 409) return "Confira os dados e as vagas disponíveis antes de tentar novamente.";
  if (status === 429) return "Aguarde alguns instantes antes de tentar novamente.";
  return "Não foi possível concluir agora. Tente novamente em instantes.";
}

export function EventReceipt({ receipt, memberToken }: { receipt: RegistrationReceipt; memberToken: string }) {
  const [status, setStatus] = useState(receipt.status);
  const [guardianStatus, setGuardianStatus] = useState(receipt.guardianAuthStatus);
  const [pix, setPix] = useState(receipt.paymentIntent);
  const [notice, setNotice] = useState("");
  const [tickets, setTickets] = useState(receipt.tickets);
  const [qr, setQr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const { confirm, confirmation } = useActionConfirmation();
  const confirmed = status === "CONFIRMED" || status === "CHECKED_IN";
  const canCancel = memberToken && (status === "CONFIRMED" || status === "PENDING_PAYMENT")
    && !tickets?.some(ticket => ticket.checkedInAt);
  useEffect(() => {
    if (!confirmed) return;
    let live = true;
    const codes = tickets?.length ? tickets.map(ticket => ticket.code) : [receipt.checkInCode];
    void import("qrcode").then(lib => Promise.all(codes.map(async code => [
      code,
      await lib.toDataURL(code, { margin: 4, width: 192, errorCorrectionLevel: "M" }),
    ] as const))).then(entries => { if (live) setQr(Object.fromEntries(entries)); }).catch(() => {});
    return () => { live = false; };
  }, [confirmed, receipt.checkInCode, tickets]);
  async function refresh() {
    setBusy(true);
    setNotice("");
    try {
      const updated = await loadMemberReceipt(memberToken, receipt.id);
      setPix(updated.paymentIntent);
      setStatus(updated.status);
      setGuardianStatus(updated.guardianAuthStatus);
      setTickets(updated.tickets);
    }
    catch (error) { setNotice(message(error)); }
    finally { setBusy(false); }
  }

  async function cancel() {
    if (!memberToken || busy) return;
    const accepted = await confirm({
      title: "Cancelar inscrição?",
      description: "A vaga será liberada. Se já pagou, fale com a equipe do evento sobre o reembolso.",
      action: "Cancelar inscrição",
      cancel: "Manter inscrição",
      tone: "danger",
    });
    if (!accepted) return;
    setBusy(true);
    setNotice("");
    try {
      const updated = await cancelMemberRegistration(memberToken, receipt.id);
      setPix(null);
      setTickets([]);
      setStatus(updated.status);
    } catch (error) {
      setNotice(error instanceof ApiRequestError && error.status === 409
        ? "A inscrição já teve presença registrada. Fale com a equipe do evento."
        : "Não foi possível cancelar a inscrição. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  const cancelAction = canCancel && <Button variant="danger" disabled={busy} onClick={() => void cancel()}>
    Cancelar inscrição
  </Button>;

  if (confirmed) return <section className={s.panel}>
    <Alert appearance="workspace" tone="success" title={status === "CHECKED_IN" ? "Presença registrada" : "Inscrição confirmada"}>
      {tickets?.length ? "Apresente o ingresso de cada participante na entrada." : "Apresente o QR ou o código na entrada do evento."}
    </Alert>
    <ul className={s.tickets}>
      {(tickets?.length ? tickets : [{ position: 0, code: receipt.checkInCode }]).map(ticket => <li key={ticket.code}>
        {ticket.position > 0 && <h3>Ingresso {ticket.position}</h3>}
        {ticket.checkedInAt && <p>Presença registrada</p>}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {qr[ticket.code] && <img src={qr[ticket.code]} alt={ticket.position ? "QR do ingresso " + ticket.position : "QR para o check-in do evento"} width={192} height={192} />}
        <p className={s.code}>{ticket.code}</p>
      </li>)}
    </ul>
    {guardianStatus === "PENDING" && <>
      <p>Para a entrada, a equipe do evento ainda precisa conferir a autorização do responsável.</p>
      <Button variant="secondary" disabled={busy} onClick={() => void refresh()}>Atualizar situação</Button>
    </>}
    <p>Referência da inscrição <span className={s.code}>{receipt.id}</span></p>
    {cancelAction}
    {notice && <p role="status">{notice}</p>}
    {confirmation}
  </section>;

  if (status === "CANCELLED") return <Alert appearance="workspace" tone="warning" title="Inscrição cancelada" />;

  return <section className={s.panel}>
    <Alert appearance="workspace" tone="info" title="Pagamento pendente">
      A inscrição será confirmada após a Tesouraria conferir o crédito na conta da igreja.
    </Alert>
    {pix?.mode === "CHURCH_PIX" && pix.pixCopiaECola && <>
      <p className={s.amount}>{formatEventPrice(pix.amountCents)}</p>
      {pix.pixTxid && <p>Referência do pagamento <strong className={s.code}>{pix.pixTxid}</strong></p>}
      <label className={s.copyField}>Pix copia e cola<textarea readOnly value={pix.pixCopiaECola} rows={3} /></label>
      <Button onClick={async () => {
        try { await navigator.clipboard.writeText(pix.pixCopiaECola ?? ""); setNotice("Código Pix copiado."); }
        catch { setNotice("Selecione e copie o código Pix acima."); }
      }}>Copiar código Pix</Button>
    </>}
    <Button variant="secondary" disabled={busy} onClick={() => void refresh()}>{busy ? "Consultando…" : "Atualizar situação"}</Button>
    {cancelAction}
    {notice && <p role="status">{notice}</p>}
    {confirmation}
  </section>;
}

export function EventRegistrationForm({ catalog, member, onSessionExpired }: {
  catalog: Catalog;
  member: { token: string; profile: MemberEventProfile };
  onSessionExpired?: (token: string) => void;
}) {
  const [modalityId, setModalityId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [lotId, setLotId] = useState("");
  const [minor, setMinor] = useState(member.profile.isMinor);
  const [receipt, setReceipt] = useState<RegistrationReceipt | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const choices = eventRegistrationChoices(catalog);
  const modality = choices.find(choice => choice.id === modalityId);
  const lots = availableEventLots(catalog.lots, modalityId, quantity);
  const lot = lots.find(choice => choice.id === lotId);
  const resourceFields = [
    { name: "lodgingOptionId", label: "Hospedagem", choices: catalog.lodgingOptions },
    { name: "mealOptionId", label: "Alimentação", choices: catalog.mealOptions },
    { name: "transportOptionId", label: "Transporte", choices: catalog.transportOptions },
  ] as const;

  const capacityMatches = modality && Number.isInteger(quantity)
    && quantity >= modality.minPartySize && quantity <= modality.maxPartySize
    && (modality.remaining === null || modality.remaining >= quantity)
    && resourceFields.every(item => !item.choices.length || item.choices.some(choice => choice.remaining === null || choice.remaining >= quantity));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lot || !modality || !capacityMatches || submitting.current || !member.token) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const read = (key: string) => String(form.get(key) ?? "").trim();
    const resources = Object.fromEntries(resourceFields.filter(item => item.choices.length).map(item => [item.name, read(item.name)]));
    try {
      setReceipt(await registerForEvent(catalog.event.slug, {
        displayName: read("name"), notificationEmail: read("email"), modalityId, lotId, partySize: quantity, isMinor: minor,
        ...(minor ? { guardianDisplayName: read("guardian"), guardianAcknowledged: form.get("consent") === "on" } : {}),
        ...resources,
      }, member.token));
    } catch (error) {
      if (onSessionExpired && isInvalidSession(error)) onSessionExpired(member.token);
      else setError(message(error));
    }
    finally { submitting.current = false; setBusy(false); }
  }

  if (receipt) return <EventReceipt receipt={receipt} memberToken={member.token} />;
  if (!choices.length) {
    return <Alert appearance="workspace" tone="info" title="Inscrições indisponíveis neste momento" />;
  }
  return <form className={s.panel} onSubmit={submit}>
    <div className={s.fields}>
      <Select label="Modalidade" value={modalityId} onChange={event => {
        const id = event.target.value;
        setModalityId(id);
        setQuantity(choices.find(choice => choice.id === id)?.minPartySize ?? 1);
        setLotId("");
      }} required options={[{ label: "Selecione", value: "" }, ...choices.map(choice => ({
        label: choice.name, value: choice.id,
      }))]} />
      {modality && <Input label="Pessoas na inscrição" type="number" min={modality.minPartySize} max={modality.maxPartySize}
        value={quantity} required onChange={event => { setQuantity(event.target.valueAsNumber); setLotId(""); }} />}
      {modality && <Select label="Lote" value={lotId} required onChange={event => setLotId(event.target.value)}
        options={[{ label: lots.length ? "Selecione" : "Sem vagas para esta opção", value: "" }, ...lots.map(choice => ({
          label: choice.name + " · " + (choice.priceCents ? formatEventPrice(choice.priceCents) : "Gratuito"), value: choice.id,
        }))]} />}
      <Input name="name" label="Nome do participante" autoComplete="name" defaultValue={member.profile.name} minLength={2} maxLength={120} required />
      <Input name="email" label="E-mail para receber a confirmação" type="email" autoComplete="email" defaultValue={member.profile.email} maxLength={254} required />
      {resourceFields.map(item => item.choices.length > 0 && <Select key={item.name} name={item.name} label={item.label} required
        options={[{ label: "Selecione", value: "" }, ...item.choices.filter(choice => choice.remaining === null || choice.remaining >= quantity)
          .map(choice => ({ label: choice.name, value: choice.id }))]} />)}
    </div>
    <label className={s.check}><input type="checkbox" checked={minor} disabled={member.profile.isMinor} onChange={event => setMinor(event.target.checked)} /> Participante menor de idade</label>
    {minor && <>
      <Input name="guardian" label="Nome do responsável" minLength={2} maxLength={120} required />
      <label className={s.check}><input name="consent" type="checkbox" required /> Sou responsável pelo participante e autorizo a inscrição.</label>
    </>}
    {modality && !capacityMatches && <Alert appearance="workspace" tone="info" title="Sem vagas para essa quantidade de pessoas" />}
    {error && <Alert appearance="workspace" tone="danger" title={error} />}
    <Button type="submit" disabled={!lot || !capacityMatches || busy}>{busy ? "Enviando…" : lot?.priceCents ? "Inscrever e gerar Pix" : "Confirmar inscrição"}</Button>
  </form>;
}

type Access =
  | { kind: "checking" | "anonymous" | "denied" | "unavailable" }
  | { kind: "ready"; token: string; profile: MemberEventProfile };

function EventDetails({ event, free }: { event: PublishedEvent; free: boolean }) {
  const [day, time] = formatPortalDate(event.startsAt).dayAndTime.split(" às ");
  return <header className={s.eventHeading}>
    {free && <span className={s.priceBadge}>Evento gratuito</span>}
    <h1>{event.name}</h1>
    <div className={s.eventFacts}>
      <div>
        <span className={s.eventIcon}><UIIcon name="calendar" size={21} /></span>
        <time dateTime={event.startsAt}><strong>{day}</strong>{time && <span>{time.replace(/:00$/, "h")}</span>}</time>
      </div>
      {event.locationText && <div>
        <span className={s.eventIcon}><UIIcon name="pin" size={21} /></span>
        <strong>{event.locationText}</strong>
      </div>}
    </div>
  </header>;
}

function RegistrationAccess({ slug }: { slug: string }) {
  return <>
    <p className={s.accessStatus}>
      <span className={s.eventIcon}><UIIcon name="ticket" size={22} /></span>
      <span className={s.openLabel}>Inscrições abertas</span>
    </p>
    <h2 id="event-registration">Faça sua inscrição</h2>
    <p className={s.accessDescription}>Entre na sua conta para reservar sua vaga. Quem é visitante pode criar uma conta de convidado.</p>
    <div className={s.eventAccess}>
      <Link href={eventAuthHref("/login/", slug)} className={s.primaryAccess}>Entrar para se inscrever<UIIcon name="arrow" size={19} /></Link>
      <Link href={eventAuthHref("/cadastro/", slug)}>Criar conta de convidado</Link>
    </div>
    <p className={s.ticketHint}><UIIcon name="lock" size={16} />O ingresso fica em Minhas inscrições.</p>
  </>;
}

export function PublicEventRegistration() {
  const slug = useSearchParams().get("evento") ?? "";
  return <RegistrationEvent key={slug} slug={slug} />;
}

function RegistrationEvent({ slug }: { slug: string }) {
  const [result, setResult] = useState<{ catalog: Catalog } | { error: string } | null>(null);
  const [access, setAccess] = useState<Access>({ kind: "checking" });
  const [profileAttempt, retryProfile] = useState(0);

  function sessionExpired(token: string) {
    if (loadStoredToken() === token) clearToken();
    setAccess({ kind: "anonymous" });
  }

  useEffect(() => {
    let live = true;
    void loadEventRegistration(slug).then(result => {
      if (!live) return;
      setResult(result ? { catalog: result } : { error: "Selecione um evento publicado na agenda." });
    }).catch(error => { if (live) setResult({ error: message(error) }); });
    return () => { live = false; };
  }, [slug]);

  useEffect(() => {
    const token = loadStoredToken();
    if (!token) {
      setAccess({ kind: "anonymous" });
      return;
    }
    let live = true;
    void loadMemberRegistrations(token).then(({ profile }) => {
      if (live) setAccess({ kind: "ready", token, profile });
    }).catch(error => {
      if (!live) return;
      if (isInvalidSession(error)) sessionExpired(token);
      else setAccess({ kind: error instanceof ApiRequestError && error.status === 403 ? "denied" : "unavailable" });
    });
    return () => { live = false; };
  }, [profileAttempt]);

  const catalog = result && "catalog" in result ? result.catalog : null;
  const choices = catalog ? eventRegistrationChoices(catalog) : [];
  const open = choices.length > 0;
  const free = open && catalog !== null && catalog.lots
    .filter(lot => choices.some(choice => availableEventLots([lot], choice.id, choice.minPartySize).length))
    .every(lot => lot.priceCents === 0);
  const accountLink = access.kind === "ready"
    ? { href: memberEventsHref(), label: "Minhas inscrições" }
    : access.kind === "denied"
      ? { href: "/app/", label: "Meu painel" }
      : { href: eventAuthHref("/login/", slug), label: "Login" };

  return <PublicPage lightHeader section="agenda" accountLink={accountLink}>
    <main className={s.page} id="conteudo" tabIndex={-1}>
      <Link className={s.agendaBack} href="/#agenda"><UIIcon name="arrow" size={19} />Voltar à agenda</Link>
      {catalog ? <div className={s.eventLayout}>
        <EventDetails event={catalog.event} free={free} />
        <div className={s.eventPicture}>
          {/* A foto de comunhão é ilustrativa quando o evento não possui capa própria. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={catalog.event.imageUrl ?? withBasePath("/images/fe-discipulado-provisorio.webp")} alt="" decoding="async" />
        </div>
        <section className={s.eventAction} aria-labelledby="event-registration">
          {!open ? <h2 id="event-registration">Inscrições indisponíveis neste momento</h2> :
            access.kind === "anonymous" ? <RegistrationAccess slug={slug} /> : <>
              <h2 id="event-registration">Faça sua inscrição</h2>
              {access.kind === "checking" && <Loading label="Verificando sua conta" />}
              {access.kind === "denied" && <Alert appearance="workspace" tone="info" title="A inscrição exige acesso de membro ou convidado." />}
              {access.kind === "unavailable" && <>
                <Alert appearance="workspace" tone="danger" title="Não foi possível carregar seu acesso." />
                <Button variant="secondary" onClick={() => {
                  setAccess({ kind: "checking" });
                  retryProfile(attempt => attempt + 1);
                }}>Tentar novamente</Button>
              </>}
              {access.kind === "ready" && <EventRegistrationForm catalog={catalog} member={access} onSessionExpired={sessionExpired} />}
            </>}
        </section>
        {catalog.event.description && <section className={s.eventAbout} aria-labelledby="event-about">
          <h2 id="event-about">Sobre o evento</h2>
          <p>{catalog.event.description}</p>
        </section>}
      </div> : <>
        <h1>Inscrição em evento</h1>
        {result && "error" in result
          ? <Alert appearance="workspace" tone="danger" title={result.error} />
          : <Loading label="Carregando evento" />}
      </>}
    </main>
  </PublicPage>;
}
