"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ApiRequestError } from "../../lib/api";
import {
  availableEventLots, loadEventRegistration, loadRegistrationStatus, registerForEvent, type RegistrationReceipt,
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

function Receipt({ receipt }: { receipt: RegistrationReceipt }) {
  const [status, setStatus] = useState(receipt.status);
  const [guardianStatus, setGuardianStatus] = useState(receipt.guardianAuthStatus);
  const [notice, setNotice] = useState("");
  const [qr, setQr] = useState("");
  const [busy, setBusy] = useState(false);
  const pix = receipt.paymentIntent;
  const confirmed = status === "CONFIRMED" || status === "CHECKED_IN";
  useEffect(() => {
    if (!confirmed) return;
    let live = true;
    void import("qrcode").then(lib => lib.toDataURL(receipt.checkInCode, {
      margin: 4, width: 256, errorCorrectionLevel: "M",
    })).then(url => { if (live) setQr(url); }).catch(() => {});
    return () => { live = false; };
  }, [confirmed, receipt.checkInCode]);
  async function refresh() {
    setBusy(true);
    setNotice("");
    try {
      const updated = await loadRegistrationStatus(receipt.checkInCode);
      setStatus(updated.status);
      setGuardianStatus(updated.guardianAuthStatus);
    }
    catch (error) { setNotice(message(error)); }
    finally { setBusy(false); }
  }
  if (confirmed) return <section className={s.panel}>
    <Alert appearance="workspace" tone="success" title={status === "CHECKED_IN" ? "Presença registrada" : "Inscrição confirmada"}>
      Apresente o QR ou o código na entrada do evento.
    </Alert>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {qr && <img src={qr} alt="QR para o check-in do evento" width={256} height={256} />}
    <p className={s.code}>{receipt.checkInCode}</p>
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
        try { await navigator.clipboard.writeText(pix.pixCopiaECola!); setNotice("Código Pix copiado."); }
        catch { setNotice("Selecione e copie o código Pix acima."); }
      }}>Copiar código Pix</Button>
    </>}
    <Button variant="secondary" disabled={busy} onClick={() => void refresh()}>{busy ? "Consultando…" : "Atualizar situação"}</Button>
    {notice && <p role="status">{notice}</p>}
  </section>;
}

function RegistrationForm({ catalog }: { catalog: Catalog }) {
  const [modalityId, setModalityId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [lotId, setLotId] = useState("");
  const [minor, setMinor] = useState(false);
  const [receipt, setReceipt] = useState<RegistrationReceipt | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const modality = catalog.modalities.find(choice => choice.id === modalityId);
  const lots = availableEventLots(catalog.lots, modalityId, quantity);
  const lot = lots.find(choice => choice.id === lotId);
  const resourceFields = [
    { name: "lodgingOptionId", label: "Hospedagem", choices: catalog.lodgingOptions },
    { name: "mealOptionId", label: "Alimentação", choices: catalog.mealOptions },
    { name: "transportOptionId", label: "Transporte", choices: catalog.transportOptions },
  ] as const;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lot || !modality || submitting.current) return;
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
      }));
    } catch (error) { setError(message(error)); }
    finally { submitting.current = false; setBusy(false); }
  }

  if (receipt) return <Receipt receipt={receipt} />;
  if (catalog.modalities.length === 0 || catalog.lots.length === 0) {
    return <Alert appearance="workspace" tone="info" title="Inscrições indisponíveis neste momento" />;
  }
  return <form className={s.panel} onSubmit={submit}>
    <div className={s.fields}>
      <Select label="Modalidade" value={modalityId} onChange={event => {
        const id = event.target.value;
        setModalityId(id);
        setQuantity(catalog.modalities.find(choice => choice.id === id)?.minPartySize ?? 1);
        setLotId("");
      }} required options={[{ label: "Selecione", value: "" }, ...catalog.modalities.map(choice => ({
        label: choice.name, value: choice.id,
      }))]} />
      {modality && <Input label="Pessoas na inscrição" type="number" min={modality.minPartySize} max={modality.maxPartySize}
        value={quantity} required onChange={event => { setQuantity(event.target.valueAsNumber); setLotId(""); }} />}
      {modality && <Select label="Lote" value={lotId} required onChange={event => setLotId(event.target.value)}
        options={[{ label: lots.length ? "Selecione" : "Sem vagas para esta opção", value: "" }, ...lots.map(choice => ({
          label: choice.name + " · " + (choice.priceCents ? formatEventPrice(choice.priceCents) : "Gratuito"), value: choice.id,
        }))]} />}
      <Input name="name" label="Nome do participante" autoComplete="name" minLength={2} maxLength={120} required />
      <Input name="email" label="E-mail para receber a confirmação" type="email" autoComplete="email" maxLength={254} required />
      {resourceFields.map(item => item.choices.length > 0 && <Select key={item.name} name={item.name} label={item.label} required
        options={[{ label: "Selecione", value: "" }, ...item.choices.filter(choice => choice.remaining === null || choice.remaining >= quantity)
          .map(choice => ({ label: choice.name, value: choice.id }))]} />)}
    </div>
    <label className={s.check}><input type="checkbox" checked={minor} onChange={event => setMinor(event.target.checked)} /> Participante menor de idade</label>
    {minor && <>
      <Input name="guardian" label="Nome do responsável" minLength={2} maxLength={120} required />
      <label className={s.check}><input name="consent" type="checkbox" required /> Sou responsável pelo participante e autorizo a inscrição.</label>
    </>}
    {error && <Alert appearance="workspace" tone="danger" title={error} />}
    <Button type="submit" disabled={!lot || busy}>{busy ? "Enviando…" : lot?.priceCents ? "Inscrever e gerar Pix" : "Confirmar inscrição"}</Button>
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
      catalog ? <RegistrationForm catalog={catalog} /> : <Loading label="Carregando evento" />}
  </main>;
}
