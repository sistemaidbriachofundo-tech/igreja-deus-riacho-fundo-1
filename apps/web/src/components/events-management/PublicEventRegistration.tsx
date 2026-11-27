"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ApiRequestError } from "../../lib/api";
import {
  availableEventLots, eventRegistrationChoices, loadEventRegistration, loadMemberReceipt, loadRegistrationStatus, memberEventsHref, registerForEvent,
  type MemberEventProfile, type RegistrationReceipt,
} from "../../lib/public-event-registration";
import { formatPortalDate } from "../../lib/portal-live-data";
import { withBasePath } from "../../lib/paths";
import { Alert, Button, Input, Loading, Select } from "../ui";
import { formatEventPrice } from "./EventRegistrationDesk";
import s from "./public-event-registration.module.css";

type Catalog = NonNullable<Awaited<ReturnType<typeof loadEventRegistration>>>;

function message(error: unknown): string {
  const status = error instanceof ApiRequestError ? error.status : null;
  if (status === 404) return "Este evento não está disponível para inscrição.";
  if (status === 400 || status === 409) return "Confira os dados e as vagas disponíveis antes de tentar novamente.";
  if (status === 429) return "Aguarde alguns instantes antes de tentar novamente.";
  return "Não foi possível concluir agora. Tente novamente em instantes.";
}

export function EventReceipt({ receipt, memberToken }: { receipt: RegistrationReceipt; memberToken?: string }) {
  const [status, setStatus] = useState(receipt.status);
  const [guardianStatus, setGuardianStatus] = useState(receipt.guardianAuthStatus);
  const [pix, setPix] = useState(receipt.paymentIntent);
  const [notice, setNotice] = useState("");
  const [tickets, setTickets] = useState(receipt.tickets);
  const [qr, setQr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const confirmed = status === "CONFIRMED" || status === "CHECKED_IN";
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
      const updated = memberToken
        ? await loadMemberReceipt(memberToken, receipt.id).then(result => {
          setPix(result.paymentIntent);
          return result;
        })
        : await loadRegistrationStatus(receipt.checkInCode);
      setStatus(updated.status);
      setGuardianStatus(updated.guardianAuthStatus);
      setTickets(updated.tickets);
    }
    catch (error) { setNotice(message(error)); }
    finally { setBusy(false); }
  }
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
      {notice && <p role="status">{notice}</p>}
    </>}
    <p>Referência da inscrição <span className={s.code}>{receipt.id}</span></p>
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
    {notice && <p role="status">{notice}</p>}
  </section>;
}

export function EventRegistrationForm({ catalog, member }: {
  catalog: Catalog;
  member?: { token: string; profile: MemberEventProfile };
}) {
  const [modalityId, setModalityId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [lotId, setLotId] = useState("");
  const [minor, setMinor] = useState(member?.profile.isMinor ?? false);
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
    if (!lot || !modality || !capacityMatches || submitting.current || (member && !member.token)) return;
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
      }, member?.token));
    } catch (error) { setError(message(error)); }
    finally { submitting.current = false; setBusy(false); }
  }

  if (receipt) return <EventReceipt receipt={receipt} memberToken={member?.token} />;
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
      <Input name="name" label="Nome do participante" autoComplete="name" defaultValue={member?.profile.name} minLength={2} maxLength={120} required />
      <Input name="email" label="E-mail para receber a confirmação" type="email" autoComplete="email" defaultValue={member?.profile.email} maxLength={254} required />
      {resourceFields.map(item => item.choices.length > 0 && <Select key={item.name} name={item.name} label={item.label} required
        options={[{ label: "Selecione", value: "" }, ...item.choices.filter(choice => choice.remaining === null || choice.remaining >= quantity)
          .map(choice => ({ label: choice.name, value: choice.id }))]} />)}
    </div>
    <label className={s.check}><input type="checkbox" checked={minor} disabled={member?.profile.isMinor} onChange={event => setMinor(event.target.checked)} /> Participante menor de idade</label>
    {minor && <>
      <Input name="guardian" label="Nome do responsável" minLength={2} maxLength={120} required />
      <label className={s.check}><input name="consent" type="checkbox" required /> Sou responsável pelo participante e autorizo a inscrição.</label>
    </>}
    {modality && !capacityMatches && <Alert appearance="workspace" tone="info" title="Sem vagas para essa quantidade de pessoas" />}
    {error && <Alert appearance="workspace" tone="danger" title={error} />}
    <Button type="submit" disabled={!lot || !capacityMatches || busy}>{busy ? "Enviando…" : lot?.priceCents ? "Inscrever e gerar Pix" : "Confirmar inscrição"}</Button>
  </form>;
}

export function PublicEventRegistration() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    const slug = new URLSearchParams(window.location.search).get("evento") ?? "";
    void loadEventRegistration(slug).then(result => {
      if (!live) return;
      if (result) setCatalog(result);
      else setError("Selecione um evento publicado na agenda.");
    }).catch(error => { if (live) setError(message(error)); });
    return () => { live = false; };
  }, []);
  return <main className={s.page}>
    <a className={s.back} href={withBasePath("/#agenda")}>Voltar à agenda</a>
    <header className={s.header}>
      <p>IGREJA DE DEUS · RIACHO FUNDO I</p>
      <h1>{catalog?.event.name ?? "Inscrição em evento"}</h1>
      {catalog && <>
        <p>{formatPortalDate(catalog.event.startsAt).dayAndTime}{catalog.event.locationText ? " · " + catalog.event.locationText : ""}</p>
        {catalog.event.description && <p>{catalog.event.description}</p>}
      </>}
    </header>
    {error ? <Alert appearance="workspace" tone="danger" title={error} /> :
      catalog ? <>
        {eventRegistrationChoices(catalog).length > 0 && <section className={s.panel}>
          <Link href={memberEventsHref(catalog.event.slug)}>Entrar como membro</Link>
          <p>Com sua conta da igreja, acompanhe o pagamento e consulte seu ingresso em Minhas inscrições.</p>
          <a href="#inscricao-visitante">Continuar como visitante</a>
        </section>}
        <div id="inscricao-visitante"><EventRegistrationForm catalog={catalog} /></div>
      </> : <Loading label="Carregando evento" />}
  </main>;
}
