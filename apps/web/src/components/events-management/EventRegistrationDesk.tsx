"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { apiGet, apiPost } from "../../lib/api";
import { dasError } from "../../lib/das-operations";
import { generateEventCode, type EventPaymentAccount, type ManagedEvent } from "../../lib/event-management";
import { withBasePath } from "../../lib/paths";
import { EventQrScanner } from "./EventQrScanner";
import { Alert } from "../ui";
import s from "./event-management.module.css";

type Modality = { id: string; name: string };
type Lot = { id: string; name: string; priceCents: number; status: string };
type Registration = { id: string; isMinor: boolean; guardianAuthStatus: string; status: string };
type BankAccount = { id: string; code: string; name: string; type: string; active: boolean };
type Payment = { id: string; amountCents: number; pixTxid: string | null; receivingAccount: { displayName: string } | null };

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const formatEventPrice = (cents: number) => currency.format(cents / 100);

export function EventPaymentField({ accounts, value, onChange }: {
  accounts: EventPaymentAccount[];
  value?: string | null;
  onChange: (id: string | null) => void;
}) {
  return <label>Conta de recebimento
    <select required value={value ?? ""} onChange={event => onChange(event.target.value || null)}>
      <option value="">Selecione a conta</option>
      {value && !accounts.some(account => account.id === value) &&
        <option value={value} disabled>Conta vinculada indisponível</option>}
      {accounts.map(account => <option key={account.id} value={account.id}>{account.name}{account.provider === "MERCADO_PAGO" ? " · Mercado Pago" : ""}</option>)}
    </select>
    {accounts.length === 0 && <span className={s.paymentHint}>Nenhuma conta de recebimento está disponível. Procure a Tesouraria.</span>}
  </label>;
}

function field(data: FormData, name: string) { return String(data.get(name) ?? "").trim(); }

export function EventRegistrationDesk({ event, token, accounts, canReconcile, canManage, onAccountsChanged }: {
  event: ManagedEvent;
  token: string;
  accounts: EventPaymentAccount[];
  canReconcile: boolean;
  canManage: boolean;
  onAccountsChanged: () => Promise<void>;
}) {
  const path = "/events/" + encodeURIComponent(event.id);
  const [modalities, setModalities] = useState<Modality[]>([]);
  const [lots, setLots] = useState<Lot[]>([]);
  const [authorizations, setAuthorizations] = useState<Registration[]>([]);
  const [guardianChoice, setGuardianChoice] = useState<string | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paid, setPaid] = useState(false);
  const [provider, setProvider] = useState<"PIX" | "MERCADO_PAGO">("PIX");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [configuringAccount, setConfiguringAccount] = useState(false);
  const [pending, setPending] = useState<Payment | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [revision, reload] = useState(0);
  const code = useRef<HTMLInputElement>(null);
  const gateRequest = useRef(false);
  const published = event.status === "PUBLISHED";
  const individual = event.ticketPolicy === "PARTICIPANT";
  const canScan = event.canScan ?? (!individual && canManage);

  useEffect(() => {
    let live = true;
    async function load() {
      try {
        const [modality, lot, payment, registrations] = await Promise.all([
          canManage ? apiGet<{ modalities: Modality[] }>(path + "/modalities", token) : null,
          canManage ? apiGet<{ lots: Lot[] }>(path + "/lots", token) : null,
          canReconcile && published ? apiGet<{ payments: Payment[] }>(path + "/pix-pendentes", token) : null,
          canManage && published ? apiGet<{ registrations: Registration[] }>(path + "/registrations", token) : null,
        ]);
        if (!live) return;
        setModalities(modality?.modalities ?? []);
        setLots(lot?.lots ?? []);
        setPayments(payment?.payments ?? []);
        setAuthorizations((registrations?.registrations ?? [])
          .filter(registration => registration.isMinor && registration.status !== "CANCELLED" && registration.guardianAuthStatus === "PENDING")
          .map(({ id, isMinor, guardianAuthStatus, status }) => ({ id, isMinor, guardianAuthStatus, status })));
      } catch (error) {
        if (live) setNotice({ text: dasError(error), error: true });
      }
    }
    void load();
    return () => { live = false; };
  }, [path, token, revision, canReconcile, canManage, published]);

  async function perform<T>(request: () => Promise<T>, success: string | ((value: T) => string), onDone?: () => void) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const result = await request();
      onDone?.();
      setNotice({ text: typeof success === "function" ? success(result) : success });
      reload(value => value + 1);
    } catch (error) {
      setNotice({ text: dasError(error), error: true });
    } finally {
      setBusy(false);
    }
  }

  function createModality(submit: FormEvent<HTMLFormElement>) {
    submit.preventDefault();
    const form = submit.currentTarget;
    const data = new FormData(form);
    const name = field(data, "name");
    void perform(() => apiPost(path + "/modalities", token, {
      code: generateEventCode(name, 40), name, kind: "CUSTOM",
      minPartySize: 1, maxPartySize: Number(field(data, "maximum")),
    }), "Tipo de inscrição salvo.", () => form.reset());
  }

  function createLot(submit: FormEvent<HTMLFormElement>) {
    submit.preventDefault();
    const form = submit.currentTarget;
    const data = new FormData(form);
    const name = field(data, "name");
    const price = Math.round(Number(field(data, "price")) * 100);
    if (paid && (!Number.isSafeInteger(price) || price < 1 || !accounts.some(account => account.id === accountId))) {
      setNotice({ text: "Informe o valor e selecione uma conta da igreja.", error: true });
      return;
    }
    const receiving = accounts.find(account => account.id === accountId);
    if (paid && provider === "MERCADO_PAGO" && receiving?.provider !== "MERCADO_PAGO") {
      setNotice({ text: "Selecione uma conta habilitada para Mercado Pago.", error: true });
      return;
    }
    void perform(() => apiPost(path + "/lots", token, {
      code: generateEventCode(name, 40), name,
      modalityId: field(data, "modality") || null, capacity: Number(field(data, "capacity")),
      status: "OPEN", currency: "BRL", priceCents: paid ? price : 0,
      receivingAccountId: paid ? accountId : null,
      ...(paid && provider === "MERCADO_PAGO" ? { paymentProvider: provider } : {}),
    }), "Lote aberto.", () => { form.reset(); setPaid(false); setAccountId(null); setProvider("PIX"); });
  }

  async function openAccountSetup() {
    try {
      const ledger = await apiGet<{ accounts: BankAccount[] }>("/ledger/accounts", token);
      setBankAccounts(ledger.accounts.filter(account => account.active && account.type === "ASSET" && /^1\.1(\.|$)/.test(account.code)));
      setConfiguringAccount(true);
    } catch (error) { setNotice({ text: dasError(error), error: true }); }
  }

  function configureAccount(submit: FormEvent<HTMLFormElement>) {
    submit.preventDefault();
    const data = new FormData(submit.currentTarget);
    void perform(async () => {
      await apiPost("/ledger/receiving-accounts", token, {
        ledgerAccountId: field(data, "bank"), displayName: field(data, "displayName"),
        pixKey: field(data, "pixKey"), merchantCity: field(data, "city") || "Brasilia",
      });
      setConfiguringAccount(false);
      await onAccountsChanged();
    }, "Conta habilitada para receber Pix dos eventos.");
  }

  function checkIn(submit: FormEvent<HTMLFormElement>) {
    submit.preventDefault();
    registerPresence(code.current?.value.trim() ?? "");
  }

  function registerPresence(checkInCode: string) {
    if (!canScan || !checkInCode || gateRequest.current || busy) return;
    gateRequest.current = true;
    void perform(() => apiPost<{ participantPosition?: number; remaining?: number; alreadyCheckedIn?: boolean; result?: string }>(
      path + (individual ? "/tickets/scan" : "/check-in"), token, individual ? { code: checkInCode } : { checkInCode },
    ), result => {
      if (result.alreadyCheckedIn || result.result === "ALREADY_READ") return "Entrada já registrada.";
      if (!result.participantPosition) return "Presença registrada.";
      const remaining = result.remaining ?? 0;
      return remaining > 0
        ? "Presença registrada. Ainda faltam " + remaining + " da mesma inscrição."
        : "Presença registrada. Todos os participantes desta inscrição chegaram.";
    }, () => {
      if (code.current) { code.current.value = ""; code.current.focus(); }
    }).finally(() => { gateRequest.current = false; });
  }

  if (event.status !== "DRAFT" && !published) return null;
  return <section className={s.panel} aria-label="Inscrições do evento">
    <h2>Inscrições do evento</h2>
    {notice && <Alert appearance="workspace" tone={notice.error ? "danger" : "success"} title={notice.text} />}
    {published && <a className={s.link} href={withBasePath("/eventos/inscricao/?evento=" + encodeURIComponent(event.slug))}>Abrir inscrição pública</a>}
    {lots.length > 0 && <ul className={s.lotList}>{lots.map(lot => <li key={lot.id}>
      <strong>{lot.name}</strong><span>{lot.priceCents > 0 ? formatEventPrice(lot.priceCents) : "Gratuito"} · {lot.status === "OPEN" ? "Aberto" : "Fechado"}</span>
    </li>)}</ul>}
    {canManage && <details className={s.registrationStep} open={modalities.length === 0}><summary>Adicionar tipo de inscrição</summary>
      <form className={s.grid} onSubmit={createModality}>
        <label>Nome do tipo de inscrição<input name="name" required maxLength={100} placeholder="Ex. Individual ou Família" />
          <small>É a opção que o participante vai escolher ao se inscrever.</small>
        </label>
        <label>Pessoas por inscrição<input name="maximum" type="number" defaultValue={1} min={1} max={20} required />
          <small>Informe o máximo que entra no mesmo pedido.</small>
        </label>
        <div className={s.actions}><button disabled={busy}>Salvar tipo de inscrição</button></div>
      </form>
    </details>}
    {canManage && <details className={s.registrationStep} open={modalities.length > 0 && lots.length === 0}><summary>Abrir lote de inscrições</summary>
      <form className={s.grid} onSubmit={createLot}>
        <label>Nome do lote<input name="name" required maxLength={100} placeholder="Ex. Primeiro lote" />
          <small>O lote define quantas vagas ficam disponíveis e o valor de cada inscrição.</small>
        </label>
        <label>Para quem é este lote<select name="modality">
          <option value="">Todos os tipos de inscrição</option>
          {modalities.map(modality => <option key={modality.id} value={modality.id}>{modality.name}</option>)}
        </select></label>
        <label>Vagas<input name="capacity" type="number" min={1} required /></label>
        <label>Cobrança<select value={paid ? "paid" : "free"} onChange={e => setPaid(e.target.value === "paid")}>
          <option value="free">Gratuita</option><option value="paid">Paga</option>
        </select></label>
        {paid && <>
          <label>Valor do lote (R$)<input name="price" type="number" inputMode="decimal" min="0.01" max="99999.99" step="0.01" required /></label>
          <label>Forma de pagamento<select value={provider} onChange={change => { setProvider(change.target.value === "MERCADO_PAGO" ? "MERCADO_PAGO" : "PIX"); setAccountId(null); }}>
            <option value="PIX">Pix da igreja</option>
            {accounts.some(account => account.provider === "MERCADO_PAGO") && <option value="MERCADO_PAGO">Mercado Pago</option>}
          </select></label>
          <EventPaymentField accounts={provider === "MERCADO_PAGO" ? accounts.filter(account => account.provider === provider) : accounts}
            value={accountId} onChange={setAccountId} />
        </>}
        <div className={s.actions}><button disabled={busy || modalities.length === 0 || (paid && !accountId)}>Abrir lote</button></div>
      </form>
    </details>}
    {published && canManage && authorizations.length > 0 && <section aria-label="Autorizações de responsáveis">
      <h3>Autorizações de responsáveis</h3>
      <ul className={s.lotList}>{authorizations.map(registration => <li key={registration.id}>
        <span>Inscrição {registration.id}</span>
        <button type="button" disabled={busy} onClick={() => setGuardianChoice(registration.id)}>Conferir autorização</button>
      </li>)}</ul>
      {guardianChoice && <form className={s.grid} onSubmit={submit => {
        submit.preventDefault();
        const id = guardianChoice;
        void perform(() => apiPost("/registrations/" + encodeURIComponent(id) + "/guardian-authorization", token,
          { status: "AUTHORIZED" }), "Autorização registrada.", () => setGuardianChoice(null));
      }}>
        <label className={s.wide}><span>Conferi a autorização do responsável pela inscrição {guardianChoice}.</span>
          <input type="checkbox" required /></label>
        <div className={s.actions}>
          <button disabled={busy}>Registrar autorização</button>
          <button className={s.secondary} type="button" disabled={busy} onClick={() => setGuardianChoice(null)}>Cancelar</button>
        </div>
      </form>}
    </section>}
    {published && canScan && <form id="check-in" className={`${s.grid} ${s.checkInPanel}`} onSubmit={checkIn}>
      <h3 className={s.wide}>Check-in</h3>
      <p className={s.wide}>Leia o QR do ingresso ou digite o código abaixo para registrar a chegada.</p>
      <label>Código do ingresso<input ref={code} name="checkInCode" autoComplete="off" minLength={8} maxLength={128} required /></label>
      <div className={s.actions}><button disabled={busy}>Registrar presença</button>
        {!busy && <EventQrScanner onRead={registerPresence} />}</div>
    </form>}
    {published && canReconcile && <section className={s.paymentPanel} aria-label="Pix pendentes">
      <h3>Pix pendentes</h3>
      <div className={s.actions}>
        <button type="button" className={s.secondary} disabled={busy || configuringAccount}
          onClick={() => void openAccountSetup()}>Habilitar conta da igreja para Pix</button>
      </div>
      {configuringAccount && <form className={s.grid} onSubmit={configureAccount}>
        <label>Conta existente<select name="bank" required>
          <option value="">Selecione</option>
          {bankAccounts.map(account => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}
        </select></label>
        <label>Nome para exibição<input name="displayName" minLength={2} maxLength={80} required /></label>
        <label>Chave Pix<input name="pixKey" autoComplete="off" minLength={8} maxLength={120} required /></label>
        <label>Cidade<input name="city" defaultValue="Brasilia" maxLength={15} /></label>
        <div className={s.actions}>
          <button disabled={busy || !bankAccounts.length}>Habilitar conta</button>
          <button className={s.secondary} type="button" disabled={busy} onClick={() => setConfiguringAccount(false)}>Cancelar</button>
        </div>
      </form>}
      <p>Confira o valor e a referência no extrato da conta indicada antes de confirmar.</p>
      {payments.length === 0 && <p>Nenhum Pix pendente neste evento.</p>}
      <ul className={s.lotList}>{payments.map(payment => <li key={payment.id}>
        <div><strong>{formatEventPrice(payment.amountCents)}</strong>
          <span>{payment.receivingAccount?.displayName ?? "Conta da igreja"} · {payment.pixTxid ?? payment.id}</span></div>
        <button type="button" disabled={busy} onClick={() => setPending(payment)}>Conferir crédito</button>
      </li>)}</ul>
      {pending && <form className={s.grid} onSubmit={submit => {
        submit.preventDefault();
        const confirmation = pending;
        const data = new FormData(submit.currentTarget);
        const statementAmount = Math.round(Number(field(data, "creditAmount").replace(",", ".")) * 100);
        void perform(() => apiPost("/events/payments/" + encodeURIComponent(confirmation.id) + "/reconcile", token,
          { bankCreditConfirmed: true, bankCreditReference: field(data, "creditReference"),
            bankCreditAmountCents: statementAmount }), "Crédito conciliado e inscrição confirmada.", () => setPending(null));
      }}>
        <label>Referência da transação no extrato
          <input name="creditReference" minLength={6} maxLength={80} autoComplete="off" required />
          <small>Copie o código que aparece nos detalhes do Pix recebido no banco.</small>
        </label>
        <label>Valor creditado em reais
          <input name="creditAmount" type="number" min="0.01" step="0.01" inputMode="decimal" required />
        </label>
        <label className={s.wide}>
          <span>Confirmei no extrato o crédito de {formatEventPrice(pending.amountCents)}.</span>
          <input type="checkbox" required />
        </label>
        <div className={s.actions}>
          <button disabled={busy}>Confirmar crédito</button>
          <button className={s.secondary} type="button" disabled={busy} onClick={() => setPending(null)}>Cancelar</button>
        </div>
      </form>}
    </section>}
  </section>;
}
