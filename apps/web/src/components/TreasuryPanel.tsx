"use client";

import { useEffect, useState, type FormEvent } from "react";
import { nextDualApprovalStage } from "@idbrf/shared";
import { ApiRequestError, apiGet, apiPost, loadStoredToken } from "../lib/api";
import { dasError, formatBRL, parseAmountCents, readDasRows, type DasRecord } from "../lib/das-operations";
import { withBasePath } from "../lib/paths";
import styles from "./treasury-panel.module.css";

/**
 * Frente B pode montar os cartões sem editar este fluxo:
 * `import { TreasuryPositionCards } from "./TreasuryPanel"`.
 * Passe `kind: "ready"` somente com o objeto `position` de GET /treasury/position.
 * Em falha use `kind: "error"` — o componente não desenha R$ 0.
 */
type Tab = "recebido" | "receber" | "compromisso" | "liquidar";

export type TreasuryPosition = {
  receivedRevenueCents: number;
  receivableOpenCents: number;
  settledCashCents: number;
  committedExpenseCents: number;
  availableCents: number;
  grossRevenueCents: number;
  feeCents: number;
  netRevenueCents: number;
  settledCostCents?: number;
  unclassifiedCents?: number;
};

export type TreasuryCardState =
  | { kind: "checking" | "disabled" | "signed-out" | "loading" }
  | { kind: "forbidden" | "error"; message: string }
  | { kind: "ready"; position: TreasuryPosition };

type EntryView = {
  id: string;
  entryDate: string;
  description: string;
  status: string;
  amountCents: number | null;
  createdByUserId: string;
  firstApprovedByUserId: string | null;
};

type ReconciliationView = {
  id: string;
  title: string;
  periodStart: string;
  periodEnd: string;
  status: string;
};

type Account = { id: string; code: string; name: string; type: string };

const POSITION_KEYS = [
  "receivedRevenueCents",
  "receivableOpenCents",
  "settledCashCents",
  "committedExpenseCents",
  "availableCents",
  "grossRevenueCents",
  "feeCents",
  "netRevenueCents",
] as const;

const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export function readTreasuryPosition(payload: unknown): TreasuryPosition | null {
  if (!payload || typeof payload !== "object") return null;
  const position = (payload as { position?: unknown }).position;
  if (!position || typeof position !== "object") return null;
  const source = position as Record<string, unknown>;
  const next = {} as TreasuryPosition;
  for (const key of POSITION_KEYS) {
    const value = source[key];
    if (typeof value !== "number" || !Number.isInteger(value)) return null;
    next[key] = value;
  }
  if (typeof source.settledCostCents === "number" && Number.isInteger(source.settledCostCents)) {
    next.settledCostCents = source.settledCostCents;
  }
  if (typeof source.unclassifiedCents === "number" && Number.isInteger(source.unclassifiedCents)) {
    next.unclassifiedCents = source.unclassifiedCents;
  }
  return next;
}

function matches(account: Account, kind: "cash" | "revenue" | "receivable" | "expense" | "payable") {
  if (kind === "cash") return account.type === "ASSET" && /^1\.1(\.|$)/.test(account.code);
  if (kind === "receivable") return account.type === "ASSET" && /^1\.2(\.|$)/.test(account.code);
  if (kind === "payable") return account.type === "LIABILITY" && /^2\.1(\.|$)/.test(account.code);
  if (kind === "expense") return account.type === "EXPENSE" && !/^5\.9(\.|$)/.test(account.code);
  return account.type === "REVENUE";
}

function statusLabel(status: string): string {
  if (status === "DRAFT") return "Rascunho";
  if (status === "PENDING_APPROVAL") return "Aguardando duas pessoas";
  if (status === "APPROVED") return "Aprovado por duas pessoas";
  if (status === "REJECTED") return "Recusado";
  if (status === "REVERSED") return "Estornado";
  return status || "Estado não informado";
}

export function approvalCopy(actorUserId: string | null, entry: EntryView): { text: string; canApprove: boolean } {
  if (entry.status !== "PENDING_APPROVAL") return { text: statusLabel(entry.status), canApprove: false };
  if (!actorUserId) return { text: "Aguardando identificar quem aprova.", canApprove: false };
  const stage = nextDualApprovalStage({
    actorUserId,
    createdByUserId: entry.createdByUserId,
    firstApprovedByUserId: entry.firstApprovedByUserId,
  });
  if (!stage.ok) {
    return {
      text: entry.firstApprovedByUserId
        ? "A primeira aprovação já é sua. Outra pessoa precisa concluir."
        : "Quem lançou não aprova a própria peça.",
      canApprove: false,
    };
  }
  return {
    text: stage.stage === "FIRST" ? "Você pode registrar a primeira aprovação." : "Você pode registrar a segunda aprovação.",
    canApprove: true,
  };
}

export function TreasuryPositionCards({ state }: { state: TreasuryCardState }) {
  if (state.kind !== "ready") {
    let message = "Consultando o ledger…";
    if (state.kind === "disabled") message = "A consulta financeira está desligada neste ambiente. Nenhum valor foi exibido.";
    else if (state.kind === "signed-out") message = "Entre com a conta de tesouraria para consultar a posição. Nenhum valor foi exibido.";
    else if (state.kind === "forbidden") message = "Seu perfil não consulta a tesouraria. Nenhum valor foi exibido.";
    else if (state.kind === "error") message = `${state.message} Nenhum valor foi exibido.`;
    return <p className={styles.unavailable} role="status">{message}</p>;
  }
  const position = state.position;
  const metrics = [
    ["Receita recebida", position.receivedRevenueCents, "Caixa que entrou contra receita ou baixa de recebível, só com lançamento aprovado."],
    ["A receber", position.receivableOpenCents, "Saldo em aberto nas contas 1.2. Não é caixa."],
    ["Caixa liquidado", position.settledCashCents, "Saldo das contas 1.1 depois dos estornos."],
    ["Despesa comprometida", position.committedExpenseCents, "Contas 2.1 aprovadas e ainda não pagas."],
  ] as const;
  return (
    <>
      <div className={styles.metrics}>
        {metrics.map(([label, cents, detail]) => (
          <article key={label} className={styles.metric}>
            <span>{label}</span>
            <strong>{formatBRL(cents)}</strong>
            <small>{detail}</small>
          </article>
        ))}
      </div>
      <div className={styles.metrics}>
        <article className={styles.metric}>
          <span>Disponível</span>
          <strong>{formatBRL(position.availableCents)}</strong>
          <small>Caixa liquidado menos a despesa comprometida. Despesa já paga não entra de novo.</small>
        </article>
        <article className={styles.metric}>
          <span>Receita bruta</span>
          <strong>{formatBRL(position.grossRevenueCents)}</strong>
          <small>Reconhecida no ledger. Não é somada de novo ao que já foi recebido.</small>
        </article>
        <article className={styles.metric}>
          <span>Taxa</span>
          <strong>{formatBRL(position.feeCents)}</strong>
          <small>Contas 5.9. Não é uma segunda receita.</small>
        </article>
        <article className={styles.metric}>
          <span>Líquido</span>
          <strong>{formatBRL(position.netRevenueCents)}</strong>
          <small>Bruto menos a taxa, como a API devolveu.</small>
        </article>
      </div>
      {typeof position.unclassifiedCents === "number" && position.unclassifiedCents !== 0 && (
        <p className={styles.note}>Há {formatBRL(position.unclassifiedCents)} fora das quatro medidas. Esse valor não foi somado ao caixa.</p>
      )}
    </>
  );
}

export function TreasuryPanel() {
  const enabled = process.env.NEXT_PUBLIC_HML_ENABLED === "true";
  const [tab, setTab] = useState<Tab>("recebido");
  const [token, setToken] = useState<string | null>(null);
  const [actorId, setActorId] = useState<string | null>(null);
  const [cards, setCards] = useState<TreasuryCardState>(enabled ? { kind: "checking" } : { kind: "disabled" });
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountsNote, setAccountsNote] = useState("");
  const [centers, setCenters] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [centerId, setCenterId] = useState("");
  const [entries, setEntries] = useState<EntryView[] | null>(null);
  const [entriesNote, setEntriesNote] = useState("");
  const [reconciliations, setReconciliations] = useState<ReconciliationView[] | null>(null);
  const [reconciliationNote, setReconciliationNote] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [entryDate, setEntryDate] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [primary, setPrimary] = useState("");
  const [secondary, setSecondary] = useState("");

  useEffect(() => {
    if (!enabled) return;
    const stored = loadStoredToken();
    setToken(stored);
    if (!stored) {
      setCards({ kind: "signed-out" });
      return;
    }
    let cancelled = false;
    setCards({ kind: "loading" });
    void loadTreasury(stored, "").then((result) => {
      if (cancelled) return;
      setActorId(result.actorId);
      setCards(result.cards);
      setAccounts(result.accounts);
      setAccountsNote(result.accountsNote);
      setCenters(result.centers);
      setEntries(result.entries);
      setEntriesNote(result.entriesNote);
      setReconciliations(result.reconciliations);
      setReconciliationNote(result.reconciliationNote);
    });
    return () => { cancelled = true; };
  }, [enabled]);

  async function changeCenter(next: string) {
    if (!token) return;
    setCenterId(next);
    setCards({ kind: "loading" });
    try {
      const payload = await apiGet<unknown>(`/treasury/position${next ? `?costCenterId=${encodeURIComponent(next)}` : ""}`, token);
      const position = readTreasuryPosition(payload);
      setCards(position
        ? { kind: "ready", position }
        : { kind: "error", message: "A API não devolveu a posição completa." });
    } catch (error) {
      setCards(failureState(error));
    }
  }

  const canPost = enabled && Boolean(token) && !busy && accounts.length > 1;
  const visibleEntries = (entries ?? []).filter((entry) => {
    if (from && entry.entryDate < from) return false;
    if (to && entry.entryDate > to) return false;
    return true;
  });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canPost) return;
    const cents = parseAmountCents(amount);
    if (!cents || description.trim().length < 4 || !primary || !secondary || primary === secondary || idempotencyKey.trim().length < 8) {
      setMessage("Informe descrição, valor positivo, chave e duas contas diferentes do plano.");
      return;
    }
    const path = tab === "recebido" ? "/treasury/cash-receipts" : tab === "receber" ? "/treasury/receivables" : tab === "compromisso" ? "/treasury/commitments" : "/treasury/settlements";
    const body = tab === "recebido" || tab === "receber"
      ? {
          idempotencyKey: idempotencyKey.trim(),
          entryDate,
          description: description.trim(),
          grossCents: cents,
          ...(tab === "recebido"
            ? { cashAccountId: primary, revenueAccountId: secondary }
            : { receivableAccountId: primary, revenueAccountId: secondary }),
          ...(centerId ? { costCenterId: centerId } : {}),
        }
      : {
          idempotencyKey: idempotencyKey.trim(),
          entryDate,
          description: description.trim(),
          amountCents: cents,
          ...(tab === "compromisso"
            ? { expenseAccountId: primary, payableAccountId: secondary }
            : { payableAccountId: primary, cashAccountId: secondary }),
          ...(centerId ? { costCenterId: centerId } : {}),
        };
    setBusy(true);
    setMessage("");
    try {
      const result = await apiPost<{ idempotentReplay?: boolean }>(path, token, body);
      setMessage(result.idempotentReplay
        ? "A mesma chave devolveu o lançamento já gravado. Nada foi duplicado."
        : "Rascunho gravado. Ele só entra na posição depois que duas pessoas diferentes aprovam.");
      const next = await loadTreasury(token, centerId);
      setCards(next.cards);
      setEntries(next.entries);
      setEntriesNote(next.entriesNote);
    } catch (error) {
      setMessage(dasError(error));
    } finally {
      setBusy(false);
    }
  }

  async function approve(entryId: string) {
    if (!token || busy) return;
    if (!window.confirm("Registrar aprovação neste lançamento de homologação?")) return;
    setBusy(true);
    setMessage("");
    try {
      await apiPost(`/ledger/entries/${encodeURIComponent(entryId)}/approve`, token);
      const next = await loadTreasury(token, centerId);
      setCards(next.cards);
      setEntries(next.entries);
      setEntriesNote(next.entriesNote);
      setMessage("Aprovação registrada. A posição só muda quando a segunda pessoa conclui.");
    } catch (error) {
      setMessage(dasError(error));
    } finally {
      setBusy(false);
    }
  }

  const primaryKind = tab === "recebido" ? "cash" : tab === "receber" ? "receivable" : tab === "compromisso" ? "expense" : "payable";
  const secondaryKind = tab === "compromisso" ? "payable" : tab === "liquidar" ? "cash" : "revenue";
  const primaryLabel = tab === "recebido" ? "Conta de caixa" : tab === "receber" ? "Conta a receber" : tab === "compromisso" ? "Conta de despesa" : "Conta a pagar";
  const secondaryLabel = tab === "compromisso" ? "Conta a pagar" : tab === "liquidar" ? "Conta de caixa" : "Conta de receita";
  const closed = reconciliations?.filter((item) => item.status === "CLOSED") ?? [];

  return (
    <section className={styles.panel} aria-labelledby="treasury-title">
      <header className={styles.header}>
        <p className={styles.kicker}>Tesouraria · homologação</p>
        <h1 id="treasury-title">Posição, extrato e conciliação</h1>
        <p className={styles.lede}>
          Os saldos aparecem só quando o ledger responde. Uma falha não aparece como saldo zerado.
          O disponível é o caixa liquidado menos o que ainda está comprometido.
        </p>
      </header>
      <p className={styles.banner} role="status">
        Ambiente de homologação. Pix, banco e maquininha permanecem bloqueados. Nenhuma movimentação sai da igreja.
      </p>
      <TreasuryPositionCards state={cards} />
      {cards.kind === "ready" && (
        <p className={styles.note}>
          {closed.length > 0
            ? `${closed.length} conciliação(ões) fechada(s). A posição acima continua sendo a leitura atual do ledger, não um saldo de banco.`
            : "Nenhuma conciliação está fechada. A posição é a leitura do ledger, ainda sem período encerrado."}
        </p>
      )}

      <div className={styles.toolbar}>
        <label>Centro de custo
          <select value={centerId} onChange={(event) => { void changeCenter(event.target.value); }} disabled={!token || centers.length === 0}>
            <option value="">Toda a congregação</option>
            {centers.map((center) => <option key={center.id} value={center.id}>{center.code} · {center.name}</option>)}
          </select>
        </label>
        <label>Extrato de
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label>Até
          <input type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} />
        </label>
      </div>
      {accountsNote && <p className={styles.note}>{accountsNote}</p>}

      <section className={styles.card} aria-label="Extrato">
        <h2>Extrato</h2>
        {entries === null && <p className={styles.note}>{entriesNote || "O extrato ainda não foi consultado."}</p>}
        {entries && entriesNote && <p className={styles.note}>{entriesNote}</p>}
        {entries && !entriesNote && visibleEntries.length === 0 && <p className={styles.note}>Nenhum lançamento neste período.</p>}
        {entries && !entriesNote && visibleEntries.map((entry) => {
          const approval = approvalCopy(actorId, entry);
          return (
            <article key={entry.id} className={styles.row}>
              <div>
                <strong>{entry.description || "Lançamento sem descrição"}</strong>
                <small>{entry.entryDate || "Data não informada"} · {entry.amountCents === null ? "Valor não informado" : formatBRL(entry.amountCents)}</small>
                <small>{approval.text}</small>
              </div>
              {approval.canApprove && (
                <button type="button" disabled={busy} onClick={() => { void approve(entry.id); }}>Registrar aprovação</button>
              )}
            </article>
          );
        })}
      </section>

      <section className={styles.card} aria-label="Conciliações">
        <h2>Conciliações</h2>
        {reconciliations === null && <p className={styles.note}>{reconciliationNote || "As conciliações ainda não foram consultadas."}</p>}
        {reconciliations && reconciliationNote && <p className={styles.note}>{reconciliationNote}</p>}
        {reconciliations && !reconciliationNote && reconciliations.length === 0 && <p className={styles.note}>O ledger não devolveu conciliações.</p>}
        {reconciliations && !reconciliationNote && reconciliations.map((item) => (
          <article key={item.id} className={styles.row}>
            <div>
              <strong>{item.title || "Conciliação"}</strong>
              <small>{item.periodStart} a {item.periodEnd}</small>
              <small>{item.status === "CLOSED" ? "Período fechado" : "Período ainda aberto"}</small>
            </div>
          </article>
        ))}
      </section>

      <div className={styles.tabs} role="tablist" aria-label="Tipo de lançamento">
        {([
          ["recebido", "Receita recebida"],
          ["receber", "Reconhecer recebível"],
          ["compromisso", "Comprometer despesa"],
          ["liquidar", "Liquidar compromisso"],
        ] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      <form className={`${styles.card} ${styles.form}`} onSubmit={onSubmit}>
        <p className={`${styles.note} ${styles.wide}`}>
          O lançamento nasce como rascunho. Quem cria não aprova a própria peça, e a segunda aprovação é de outra pessoa.
          A mesma chave não cria outro lançamento.
          {!enabled && " A gravação fica desligada enquanto a homologação da interface não está habilitada."}
          {enabled && !token && cards.kind !== "checking" && cards.kind !== "loading" && " Entre para consultar a API. Nenhuma conta é inventada aqui."}
        </p>
        <label>Chave de idempotência
          <input value={idempotencyKey} onChange={(event) => setIdempotencyKey(event.target.value)} minLength={8} maxLength={80} required />
        </label>
        <label>Data
          <input type="date" value={entryDate} onChange={(event) => setEntryDate(event.target.value)} required />
        </label>
        <label className={styles.wide}>Descrição
          <input value={description} onChange={(event) => setDescription(event.target.value)} minLength={4} maxLength={180} required />
        </label>
        <label>Valor em reais
          <input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="100,00" required />
        </label>
        <label>{primaryLabel}
          <select value={primary} onChange={(event) => setPrimary(event.target.value)} required>
            <option value="">Selecione uma conta da API</option>
            {accounts.filter((account) => matches(account, primaryKind)).map((account) => (
              <option key={account.id} value={account.id}>{account.code} · {account.name}</option>
            ))}
          </select>
        </label>
        <label>{secondaryLabel}
          <select value={secondary} onChange={(event) => setSecondary(event.target.value)} required>
            <option value="">Selecione uma conta da API</option>
            {accounts.filter((account) => matches(account, secondaryKind)).map((account) => (
              <option key={account.id} value={account.id}>{account.code} · {account.name}</option>
            ))}
          </select>
        </label>
        <button className={styles.wide} type="submit" disabled={!canPost}>Gravar rascunho</button>
        {message && <p className={`${styles.status} ${styles.wide}`} role="status">{message}</p>}
      </form>
      <p className={styles.note}><a href={withBasePath("/app/relatorios/")}>Abrir relatórios</a></p>
    </section>
  );
}

function failureState(error: unknown): TreasuryCardState {
  if (error instanceof ApiRequestError && error.status === 403) {
    return { kind: "forbidden", message: "Seu perfil não consulta a tesouraria." };
  }
  return { kind: "error", message: dasError(error) };
}

async function loadTreasury(token: string, centerId: string) {
  const [me, positionResult, accountResult, entryResult, reconciliationResult, centerResult] = await Promise.allSettled([
    apiGet<{ userId?: string }>("/auth/me", token),
    apiGet<unknown>(`/treasury/position${centerId ? `?costCenterId=${encodeURIComponent(centerId)}` : ""}`, token),
    apiGet<unknown>("/ledger/accounts", token),
    apiGet<unknown>("/ledger/entries", token),
    apiGet<unknown>("/ledger/reconciliations", token),
    apiGet<unknown>("/ledger/cost-centers", token),
  ]);
  const actorId = me.status === "fulfilled" && typeof me.value.userId === "string" ? me.value.userId : null;
  const cards = positionResult.status === "fulfilled"
    ? (() => {
        const position = readTreasuryPosition(positionResult.value);
        return position ? { kind: "ready" as const, position } : { kind: "error" as const, message: "A API não devolveu a posição completa." };
      })()
    : failureState(positionResult.reason);
  let accounts: Account[] = [];
  let accountsNote = "";
  if (accountResult.status === "fulfilled") {
    try {
      accounts = readDasRows(accountResult.value, "accounts").flatMap((row) => {
        const id = str(row.id);
        if (!id) return [];
        return [{ id, code: str(row.code), name: str(row.name), type: str(row.type) }];
      });
    } catch (error) {
      accountsNote = dasError(error);
    }
  } else {
    accountsNote = "O plano de contas não foi consultado. Nenhuma conta foi inventada.";
  }
  const entries = entryResult.status === "fulfilled" ? readEntries(entryResult.value) : null;
  const entriesNote = entryResult.status === "fulfilled"
    ? (entries ? "" : "O extrato veio incompleto e não foi exibido.")
    : "O extrato não foi consultado. A lista não foi substituída por vazia.";
  const reconciliations = reconciliationResult.status === "fulfilled" ? readReconciliations(reconciliationResult.value) : null;
  const reconciliationNote = reconciliationResult.status === "fulfilled"
    ? (reconciliations ? "" : "As conciliações vieram incompletas e não foram exibidas.")
    : "As conciliações não foram consultadas.";
  const centers = centerResult.status === "fulfilled" ? readCenters(centerResult.value) : [];
  return { actorId, cards, accounts, accountsNote, entries, entriesNote, reconciliations, reconciliationNote, centers };
}

function readEntries(payload: unknown): EntryView[] | null {
  let rows: DasRecord[];
  try {
    rows = readDasRows(payload, "entries");
  } catch {
    return null;
  }
  const entries: EntryView[] = [];
  for (const row of rows) {
    const id = str(row.id);
    if (!id) return null;
    const amount = row.amountCents;
    if (amount !== undefined && amount !== null && (typeof amount !== "number" || !Number.isInteger(amount))) return null;
    entries.push({
      id,
      entryDate: str(row.entryDate),
      description: str(row.description),
      status: str(row.status),
      amountCents: typeof amount === "number" ? amount : null,
      createdByUserId: str(row.createdByUserId),
      firstApprovedByUserId: str(row.firstApprovedByUserId) || null,
    });
  }
  return entries;
}

function readReconciliations(payload: unknown): ReconciliationView[] | null {
  let rows: DasRecord[];
  try {
    rows = readDasRows(payload, "reconciliations");
  } catch {
    return null;
  }
  const items: ReconciliationView[] = [];
  for (const row of rows) {
    const id = str(row.id);
    if (!id) return null;
    items.push({
      id,
      title: str(row.title),
      periodStart: str(row.periodStart),
      periodEnd: str(row.periodEnd),
      status: str(row.status),
    });
  }
  return items;
}

function readCenters(payload: unknown): Array<{ id: string; code: string; name: string }> {
  try {
    return readDasRows(payload, "costCenters").flatMap((row) => {
      const id = str(row.id);
      if (!id) return [];
      return [{ id, code: str(row.code), name: str(row.name) }];
    });
  } catch {
    return [];
  }
}
