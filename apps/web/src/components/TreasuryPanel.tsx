"use client";

import { isAdminEnabled } from "../lib/admin-environment";
import { AppNavLink, UIIcon, usePersonaAccess } from "./AppShell";

import { useActionConfirmation } from "./ui/ActionConfirmation";
import { useFeedback } from "./ui/FeedbackProvider";

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { nextDualApprovalStage } from "@idbrf/shared";
import { ApiRequestError, apiGet, apiPost, apiPostForm, loadStoredToken } from "../lib/api";
import { dasError, formatBRL, parseAmountCents, readDasRows, type DasRecord } from "../lib/das-operations";
import { ledgerChannel, statementCashEffect, summarizeTreasury, treasuryChannels, type TreasuryAccount as Account, type TreasuryEntry as EntryView } from "../lib/treasury-overview";
import { TreasuryOverview } from "./TreasuryOverview";
import { TreasuryBankStatements } from "./TreasuryBankStatements";
import { treasuryMovementFromHash, treasuryMovementHash, treasurySectionFromHash, type TreasurySection } from "../lib/treasury-navigation";
import { ExpenseApprovals } from "./ExpenseApprovals";
import { PageHeader } from "./ui/PageHeader";
import { FilterDisclosure } from "./ui/FilterDisclosure";
import { WorkspaceSearch } from "./ui/WorkspaceSearch";
import ui from "./ui/ui.module.css";
import styles from "./treasury-panel.module.css";

/**
 * Frente B pode montar os cartões sem editar este fluxo:
 * `import { TreasuryPositionCards } from "./TreasuryPanel"`.
 * Passe `kind: "ready"` somente com o objeto `position` de GET /treasury/position.
 * Em falha use `kind: "error"` — o componente não desenha R$ 0.
 */
type Tab = "despesa" | "pix" | "cartao" | "dinheiro" | "deposito" | "liquidacao" | "compromisso" | "pagar";

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
  countedEntryIds?: string[];
};

export type TreasuryCardState =
  | { kind: "checking" | "disabled" | "signed-out" | "loading" }
  | { kind: "forbidden" | "error"; message: string }
  | { kind: "ready"; position: TreasuryPosition };

type ReconciliationView = {
  id: string;
  title: string;
  periodStart: string;
  periodEnd: string;
  status: string;
};

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
  if (Array.isArray(source.countedEntryIds) && source.countedEntryIds.every(id => typeof id === "string")) next.countedEntryIds = source.countedEntryIds;
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

export function approvalCopy(actorUserId: string | null, entry: Pick<EntryView, "status" | "createdByUserId" | "firstApprovedByUserId" | "approvalFlow">, actorRoles: readonly string[] = ["TESOURARIA"]): { text: string; canApprove: boolean } {
  if (entry.approvalFlow === "TREASURER_THEN_PASTOR") {
    if (entry.status === "APPROVED") return { text: "Aprovada pelo pastor", canApprove: false };
    if (entry.status !== "PENDING_APPROVAL") return { text: statusLabel(entry.status), canApprove: false };
    const required = entry.firstApprovedByUserId ? "PASTOR" : "TESOURARIA";
    const blocked = !actorUserId || actorUserId === entry.createdByUserId || actorUserId === entry.firstApprovedByUserId;
    return { text: entry.firstApprovedByUserId ? "Aguardando aprovação do pastor" : "Aguardando conferência da Tesouraria", canApprove: !blocked && actorRoles.includes(required) };
  }
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
    let message = "Consultando lançamentos…";
    if (state.kind === "disabled") message = "A consulta financeira está desligada neste ambiente. Nenhum valor foi exibido.";
    else if (state.kind === "signed-out") message = "Entre com um perfil autorizado para consultar a posição. Nenhum valor foi exibido.";
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

/** Despesas pendentes não integram o saldo até o pastor concluir a aprovação. */
export function expenseWorkflowStatus(entry: Pick<EntryView, "status" | "firstApprovedByUserId">): string {
  if (entry.status === "PENDING_APPROVAL") {
    return entry.firstApprovedByUserId ? "Aguardando aprovação do pastor" : "Aguardando conferência da Tesouraria";
  }
  if (entry.status === "APPROVED") return "Aprovada pelo pastor";
  if (entry.status === "REJECTED") return "Devolvida para correção";
  if (entry.status === "REVERSED") return "Estornada";
  return statusLabel(entry.status);
}

export function TreasuryPanel() {
  const { showFeedback } = useFeedback();
  const access = usePersonaAccess();
  const canWrite = access.kind === "ready" && access.roles.includes("TESOURARIA");
  const canCreateExpense = access.kind === "ready" &&
    (access.roles.includes("TESOURARIA") || access.roles.includes("PLATFORM_ADMIN"));
  const canImportStatement = canCreateExpense;
  const isPastorOnly = access.kind === "ready" && access.roles.includes("PASTOR") && !canCreateExpense;
  const canReviewApprovals = access.kind === "ready" &&
    (access.roles.includes("TESOURARIA") || access.roles.includes("PASTOR"));
  const { confirm, confirmation } = useActionConfirmation();
  const enabled = isAdminEnabled();
  const [token, setToken] = useState<string | null>(null);
  const [data, setData] = useState<Awaited<ReturnType<typeof loadTreasury>> | null>(null);
  const [failure, setFailure] = useState("");
  const [center, setCenter] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<{ id: string; message: string } | null>(null);
  const [targetExpense, setTargetExpense] = useState("");
  const [view, setView] = useState<TreasurySection>("visao");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [bankFilter, setBankFilter] = useState("");
  const [channelFilter, setChannelFilter] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [statementStatus, setStatementStatus] = useState("");
  const [churchDate, setChurchDate] = useState("");
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const intent = useRef("");
  const [tab, setTab] = useState<Tab>("despesa");
  const treasuryRoles = access.kind === "ready" ? access.roles.join("|") : "";

  // Navegação lateral e abas locais compartilham a mesma seção da URL.
  // Hashes funcionam no GitHub Pages sem novas rotas ou dependência de servidor.
  useEffect(() => {
    const roles = treasuryRoles ? treasuryRoles.split("|") : [];
    const syncFromHash = () => {
      const section = treasurySectionFromHash(window.location.hash, roles);
      setView(section);
      if (section === "lancar") setTab(canWrite ? treasuryMovementFromHash(window.location.hash) : "despesa");
    };
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, [treasuryRoles, canWrite]);

  useEffect(() => {
    if (enabled) setToken(loadStoredToken());
    setChurchDate(new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date()));
    setTargetExpense(new URLSearchParams(window.location.search).get("despesa") ?? "");
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !token || isPastorOnly) return;
    let cancelled = false;
    setData(null);
    setFailure("");
    void loadTreasury(token, center ?? "").then(result => {
      if (cancelled) return;
      // Em nenhuma congregação escolhemos automaticamente um centro de custo fictício.
      setData(result);
    }).catch(error => { if (!cancelled) setFailure(dasError(error)); });
    return () => { cancelled = true; };
  }, [enabled, token, center, revision, isPastorOnly]);

  useEffect(() => {
    if (data && view === "despesas" && targetExpense) {
      document.getElementById(`despesa-${targetExpense}`)?.scrollIntoView({ block: "center" });
    }
  }, [data, view, targetExpense]);

  const cards: TreasuryCardState = data?.cards ?? (
    !enabled ? { kind: "disabled" } : failure ? { kind: "error", message: failure } : token ? { kind: "loading" } : { kind: "checking" }
  );
  const activeCenter = center ?? "";
  const entries = data?.entries ?? [];
  const accounts = data?.accounts ?? [];
  const accountMap = new Map(accounts.map(account => [account.id, account]));
  const demoAccounts = accounts.some(account => /\(demo\)/i.test(account.name));
  const scopeEntries = entries.filter(entry => !activeCenter || entry.costCenterId === activeCenter);
  const expenseRows = scopeEntries.filter(entry => entry.approvalFlow === "TREASURER_THEN_PASTOR" &&
    (!from || entry.entryDate >= from) && (!to || entry.entryDate <= to));
  const summary = cards.kind === "ready" && cards.position.countedEntryIds && data?.entries && !data.accountsNote
    ? summarizeTreasury(accounts, entries, cards.position.countedEntryIds, { from, to })
    : null;
  const isSample = data?.centers.some(item => item.id === activeCenter && item.code === "QA-TESOURARIA") === true;
  const validPeriod = !from || !to || from <= to;
  const rows = scopeEntries.filter(entry => {
    if (statementStatus === "reconciled" && !entry.reconciliationId) return false;
    if (statementStatus && statementStatus !== "reconciled" && entry.status !== statementStatus) return false;
    if (from && entry.entryDate < from) return false;
    if (to && entry.entryDate > to) return false;
    if (bankFilter && !entry.lines.some(line => line.accountId === bankFilter)) return false;
    if (channelFilter && ledgerChannel(entry, accountMap) !== channelFilter) return false;
    return !query || entry.description.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR"));
  });
  const reconciliations = data?.reconciliations ?? [];
  const statementPage = Math.min(page, Math.max(1, Math.ceil(rows.length / 15)));
  const movementsByDay = new Map<string, EntryView[]>();
  for (const entry of rows.slice((statementPage - 1) * 15, statementPage * 15)) {
    const date = entry.entryDate.slice(0, 10);
    movementsByDay.set(date, [...(movementsByDay.get(date) ?? []), entry]);
  }

  function clearStatementFilters() {
    setBankFilter("");
    setChannelFilter("");
    setStatementStatus("");
    setQuery("");
    setPage(1);
  }

  function openView(next: TreasurySection, movement?: Tab) {
    setView(next);
    setPage(1);
    if (typeof window !== "undefined") {
      const hash = next === "lancar" ? treasuryMovementHash(movement ?? tab) : `#${next}`;
      if (window.location.hash !== hash) window.location.hash = hash;
    }
  }

  function openMovement(next: Tab) {
    if (!canWrite && next !== "despesa") return;
    if (!canCreateExpense && next === "despesa") return;
    setTab(next);
    intent.current = "";
    openView("lancar", next);
  }

  async function runEntryAction(entry: EntryView, action: "submit" | "approve") {
    if (!token || busy || !canWrite) return;
    setBusy(true);
    try {
      if (!(await confirm({
        title: action === "submit" ? "Enviar para aprovação?" : "Registrar aprovação?",
        subject: entry.description,
        description: action === "submit" ? "Duas pessoas autorizadas precisam aprovar para o movimento entrar nos saldos." : "A aprovação será registrada no histórico deste lançamento.",
        action: action === "submit" ? "Enviar para aprovação" : "Registrar aprovação",
      }))) return;
      await apiPost("/ledger/entries/" + encodeURIComponent(entry.id) + "/" + action, token);
      showFeedback({ tone: "success", title: action === "submit" ? "Enviado para aprovação" : "Aprovação registrada", message: action === "submit" ? "O lançamento seguirá o fluxo de aprovação." : "A decisão foi registrada no histórico." });
      setRevision(value => value + 1);
    } catch (error) {
      showFeedback({ tone: "error", title: "Operação não concluída", message: dasError(error) });
    } finally {
      setBusy(false);
    }
  }

  const payables = accounts.filter(account => matches(account, "payable"));
  const banks = accounts.filter(account => matches(account, "cash"));
  const bankIds = new Set(banks.map(account => account.id));
  const expenses = accounts.filter(account => matches(account, "expense"));
  const channels = treasuryChannels.find(channel => channel.id === tab);
  const revenue = channels ? accounts.find(account => account.code === channels.revenue && account.type === "REVENUE") : undefined;
  const waiting = channels && "pending" in channels ? accounts.find(account => account.code === channels.pending && account.type === "ASSET") : undefined;
  const depositAccount = accounts.find(account => account.code === "1.2.20.02" && account.type === "ASSET");
  const cardAccount = accounts.find(account => account.code === "1.2.20.01" && account.type === "ASSET");
  const receiving = tab === "pix" || tab === "cartao" || tab === "dinheiro";
  const transfer = tab === "deposito" || tab === "liquidacao";
  const originAccount = tab === "deposito" ? depositAccount : cardAccount;
  const pendingBalance = tab === "deposito" ? summary?.pending.dinheiro : summary?.pending.cartao;
  const feeAccount = accounts.find(account => account.code === "5.9.10.01" && account.type === "EXPENSE");

  async function attachReceipt(event: FormEvent<HTMLFormElement>, entry: EntryView) {
    event.preventDefault();
    if (!token || !canWrite || busy) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const file = fields.get("file");
    if (!(file instanceof File) || file.size === 0 || file.size > 4 * 1024 * 1024 ||
        !["application/pdf", "image/jpeg", "image/png"].includes(file.type)) {
      setAttachment({ id: entry.id, message: "Selecione PDF, JPG ou PNG com até 4 MB." });
      return;
    }
    setBusy(true);
    setAttachment(null);
    try {
      await apiPostForm("/ledger/entries/" + encodeURIComponent(entry.id) + "/attachments", token, fields);
      form.reset();
      showFeedback({ tone: "success", title: "Comprovante anexado", message: "O arquivo está disponível na revisão da despesa." });
    } catch (error) {
      setAttachment({ id: entry.id, message: dasError(error) });
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || busy || (tab === "despesa" ? !canCreateExpense : !canWrite)) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const entryDate = str(fields.get("date"));
    const description = str(fields.get("description"));
    const amountCents = parseAmountCents(str(fields.get("amount")));
    const primary = str(fields.get("primary"));
    const secondary = str(fields.get("secondary"));
    const feeInput = str(fields.get("fee"));
    const feeCents = feeInput && !/^0+(?:[,.]0{1,2})?$/.test(feeInput) ? parseAmountCents(feeInput) : 0;
    if (!amountCents || description.length < 4 || feeCents === null || feeCents >= amountCents) {
      showFeedback({ tone: "error", title: "Confira o lançamento", message: "Revise a descrição, o valor do lançamento e a taxa." });
      return;
    }
    if (transfer && (!originAccount || pendingBalance === undefined || amountCents > pendingBalance || (feeCents > 0 && !feeAccount))) {
      showFeedback({ tone: "error", title: "Confira o valor em aberto", message: "Revise a conta de origem e o valor em aberto antes de registrar a baixa." });
      return;
    }
    if (receiving && !revenue) return;
    const common = { entryDate, description, ...(activeCenter ? { costCenterId: activeCenter } : {}) };
    setBusy(true);
    try {
      let success = "Rascunho gravado. Use o extrato para enviar à aprovação.";
      if (tab === "despesa") {
        if (!expenses.some(account => account.id === primary) || !banks.some(account => account.id === secondary)) {
          throw new Error("Escolha uma categoria de despesa e uma conta bancária válidas.");
        }
        if (!(await confirm({
          title: "Enviar despesa ao pastor?",
          subject: description,
          description: "A despesa ficará pendente até a aprovação do pastor. Confira os dados antes de enviar.",
          content: <dl className={styles.expenseReview}>
            <div><dt>Valor</dt><dd>{formatBRL(amountCents)}</dd></div>
            <div><dt>Data</dt><dd>{displayDate(entryDate)}</dd></div>
            <div><dt>Categoria</dt><dd>{accountMap.get(primary)?.name}</dd></div>
            <div><dt>Conta bancária</dt><dd>{accountMap.get(secondary)?.name}</dd></div>
          </dl>,
          action: "Enviar ao pastor",
        }))) return;
        if (!intent.current) intent.current = crypto.randomUUID();
        const entry = await apiPost<{ status: string }>("/ledger/expenses", token, {
          ...common, requestId: intent.current, expenseAccountId: primary, cashAccountId: secondary, amountCents,
        });
        success = entry.status === "APPROVED"
          ? "Esta despesa já foi aprovada pelo pastor."
          : "Despesa registrada e encaminhada para aprovação do pastor.";
      } else if (transfer && originAccount) {
        const lines = [
          { accountId: primary, side: "DEBIT", amountCents: amountCents - feeCents, memo: "Tesouraria · crédito no banco" },
          { accountId: originAccount.id, side: "CREDIT", amountCents, memo: "Tesouraria · baixa da pendência" },
        ];
        if (feeCents > 0 && feeAccount) lines.push({ accountId: feeAccount.id, side: "DEBIT", amountCents: feeCents, memo: "Taxa de cartão" });
        await apiPost("/ledger/entries", token, { ...common, lines });
      } else {
        if (!intent.current) intent.current = crypto.randomUUID();
        const base = { ...common, idempotencyKey: intent.current };
        if (tab === "pix") await apiPost("/treasury/cash-receipts", token, { ...base, cashAccountId: primary, revenueAccountId: revenue?.id, grossCents: amountCents });
        else if (tab === "cartao" || tab === "dinheiro") await apiPost("/treasury/receivables", token, { ...base, receivableAccountId: waiting?.id, revenueAccountId: revenue?.id, grossCents: amountCents });
        else if (tab === "compromisso") await apiPost("/treasury/commitments", token, { ...base, expenseAccountId: primary, payableAccountId: secondary, amountCents });
        else await apiPost("/treasury/settlements", token, { ...base, payableAccountId: primary, cashAccountId: secondary, amountCents });
      }
      form.reset();
      intent.current = "";
      showFeedback({ tone: "success", title: "Lançamento registrado", message: success });
      setBankFilter("");
      setChannelFilter("");
      setQuery("");
      setFrom("");
      setTo("");
      openView(tab === "despesa" ? "despesas" : "extrato");
      setRevision(value => value + 1);
    } catch (error) {
      showFeedback({ tone: "error", title: "Operação não concluída", message: dasError(error) });
    } finally {
      setBusy(false);
    }
  }

  const tabConfig = [
    ["despesa", "Despesa"], ["pix", "Entrada Pix"], ["cartao", "Entrada cartão"], ["dinheiro", "Dinheiro de culto"], ["deposito", "Depósito de dinheiro"],
    ["liquidacao", "Liquidação de cartão"], ["compromisso", "Nova conta a pagar"], ["pagar", "Pagamento"],
  ] as const;
  const displayedTabConfig = canWrite ? tabConfig : tabConfig.filter(([id]) => id === "despesa");
  const disabled = !enabled || !token || busy || !accounts.length ||
    (tab === "despesa" && (!expenses.length || !banks.length)) ||
    (receiving && (!revenue || (tab !== "pix" && !waiting))) ||
    (transfer && (!originAccount || pendingBalance === undefined || pendingBalance <= 0));

  const scopeFilters = (
    <div className={`${styles.toolbar} ${styles.scopeFilters}`} role="group" aria-label="Escopo da Tesouraria">
      <label>Centro de custo
        <select value={activeCenter} onChange={event => { setCenter(event.target.value); setBankFilter(""); setPage(1); }} disabled={!data?.centers.length || busy}>
          <option value="">Toda a congregação</option>
          {data?.centers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      {view !== "lancar" && <>
        <label>Movimentos de <input type="date" value={from} max={to || undefined} onChange={event => { setFrom(event.target.value); setPage(1); }} /></label>
        <label>Até <input type="date" value={to} min={from || undefined} onChange={event => { setTo(event.target.value); setPage(1); }} /></label>
      </>}
    </div>
  );
  const statementFilterCount = [activeCenter, from || to, bankFilter, channelFilter, statementStatus].filter(Boolean).length;

  if (isPastorOnly) return <ExpenseApprovals />;

  return (
    <section className={styles.panel} aria-label="Tesouraria">
      {confirmation}
      <PageHeader appearance="workspace" heading="h1" title="Tesouraria"
        description={isSample ? "Dados de teste de novembro de 2026" : undefined}
        actions={canCreateExpense && view !== "lancar" ? <>
          <button type="button" className={`${ui.workspacePrimary} ${styles.headerPrimary}`} onClick={() => openMovement("despesa")}>
            <UIIcon name="plus" size={17} /> Incluir despesa
          </button>
          {canWrite && <button type="button" className={`${ui.workspaceQuiet} ${styles.headerShortcut}`} aria-label="Novo lançamento" onClick={() => openMovement("pix")}>
            <UIIcon name="wallet" size={17} /> <span className={styles.actionFull}>Novo lançamento</span><span className={styles.actionShort}>Lançamento</span>
          </button>}
          {canWrite && <AppNavLink className={`${ui.workspaceQuiet} ${styles.headerShortcut}`} aria-label="Pix de eventos" href="/app/eventos-gestao/">
            <UIIcon name="calendar" size={17} /> <span className={styles.actionFull}>Pix de eventos</span><span className={styles.actionShort}>Pix</span>
          </AppNavLink>}
        </> : undefined}
      />
      <nav className={`${ui.workspaceTabs} ${styles.sectionNavigation}`} aria-label="Áreas da Tesouraria">
        <button type="button" aria-current={view === "visao" ? "page" : undefined} onClick={() => openView("visao")}><UIIcon name="grid" size={17} /> Visão geral</button>
        <button type="button" aria-current={view === "despesas" ? "page" : undefined} onClick={() => openView("despesas")}><UIIcon name="wallet" size={17} /> Despesas</button>
        <button type="button" aria-current={view === "extrato" ? "page" : undefined} onClick={() => openView("extrato")}><UIIcon name="book" size={17} /> Extrato</button>
        <button type="button" aria-current={view === "conciliacao" ? "page" : undefined} onClick={() => openView("conciliacao")}><UIIcon name="check" size={17} /> Conciliações</button>
        {canReviewApprovals && <button type="button" aria-current={view === "aprovacoes" ? "page" : undefined} onClick={() => openView("aprovacoes")}><UIIcon name="shield" size={17} /> Aprovações</button>}
      </nav>
      {view !== "aprovacoes" && view !== "extrato" && view !== "despesas" && scopeFilters}
      {view !== "lancar" && view !== "aprovacoes" && !validPeriod && <p className={styles.unavailable} role="alert">Escolha uma data final posterior ou igual à inicial.</p>}
      <section className={styles.viewBody} aria-label="Conteúdo da Tesouraria">
        {view === "aprovacoes" && canReviewApprovals && <ExpenseApprovals embedded onApproved={() => setRevision(value => value + 1)} />}
        {view === "visao" && canWrite && token && <MinistryCostCenterSetup token={token}
          onConfigured={() => setRevision(value => value + 1)} />}
        {view === "visao" && data?.entries && <section className={styles.expenseQueue} aria-label="Despesas aguardando aprovação">
          <div><strong>Despesas aguardando aprovação</strong><span>{expenseRows.filter(entry => entry.status === "PENDING_APPROVAL").length} nesta seleção</span></div>
          <button className={ui.workspaceSecondary} type="button" onClick={() => openView(canReviewApprovals ? "aprovacoes" : "despesas")}>Ver despesas</button>
        </section>}
        {view === "visao" && (summary && cards.kind === "ready" && validPeriod ? (
          <TreasuryOverview position={cards.position} summary={summary}
            onBank={id => { clearStatementFilters(); setBankFilter(id); openView("extrato"); }}
            onDeposits={() => { clearStatementFilters(); setChannelFilter("dinheiro"); openView("extrato"); }}
            onReconciliation={() => openView("conciliacao")} />
        ) : <TreasuryPositionCards state={cards} />)}

        {view === "despesas" && <section className={`${styles.card} ${styles.financialSurface}`} aria-label="Despesas da congregação">
          <FinancialHeading icon="wallet" title="Despesas da congregação">
            {data?.entries && <span className={styles.statementCount}>{expenseRows.length} {expenseRows.length === 1 ? "despesa no período" : "despesas no período"}</span>}
          </FinancialHeading>
          <FilterDisclosure count={[activeCenter, from || to].filter(Boolean).length}>{scopeFilters}</FilterDisclosure>
          {demoAccounts && <p className={styles.unavailable} role="status">Este ambiente usa contas demonstrativas. Não registre despesas reais antes da configuração do plano de contas de produção.</p>}
          {!canCreateExpense && access.kind === "ready" && <p className={styles.unavailable} role="status">
            Seu perfil pode consultar as despesas, mas somente quem tem permissão de Tesouraria pode cadastrar uma nova.
            A aprovação final pertence ao pastor da congregação.
          </p>}
          {!data && <TreasuryPositionCards state={cards} />}
          {data?.entriesNote && <p className={styles.unavailable} role="alert">{data.entriesNote}</p>}
          {data?.entries && expenseRows.length === 0 && <p className={styles.expenseEmpty}>Nenhuma despesa cadastrada neste centro de custo. {canCreateExpense ? "Use Incluir despesa para registrar a primeira." : ""}</p>}
          {expenseRows.map(entry => {
            const workflow = expenseWorkflowStatus(entry);
            const canApproveExpense = canWrite && approvalCopy(data?.actorId ?? null, entry, access.kind === "ready" ? access.roles : []).canApprove;
            return <article key={entry.id} className={styles.expenseItem} id={`despesa-${entry.id}`} data-target={targetExpense === entry.id}>
              <div className={styles.expenseIdentity}>
                <span className={styles.expenseMark}><UIIcon name="wallet" size={19} /></span>
              <div className={styles.expenseInfo}>
                <strong>{entry.description}</strong>
                <small>{displayDate(entry.entryDate)}</small>
                <span className={styles.expenseState} data-status={entry.status}>{workflow}</span>
                {entry.rejectionReason && entry.status === "REJECTED" && <small>Motivo da devolução: {entry.rejectionReason}</small>}
              </div>
              </div>
              <strong className={styles.amount}>{entry.amountCents === null ? "—" : formatBRL(entry.amountCents)}</strong>
              {canWrite && entry.status === "PENDING_APPROVAL" && <details className={styles.receiptUpload}>
                <summary>Anexar comprovante</summary>
                <form onSubmit={event => void attachReceipt(event, entry)}>
                  <label>Arquivo (PDF, JPG ou PNG)<input type="file" name="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" required /></label>
                  <button type="submit" className={ui.workspaceSecondary} disabled={busy}>Anexar</button>
                </form>
                {attachment?.id === entry.id && <p role="alert">{attachment.message}</p>}
              </details>}
              {canApproveExpense && <button type="button" className={`${ui.workspaceSecondary} ${styles.entryAction}`} disabled={busy} onClick={() => void runEntryAction(entry, "approve")}>Registrar conferência</button>}
            </article>;
          })}
        </section>}

        {view === "extrato" && <section className={styles.statementWorkspace} aria-label="Extrato">
          <FinancialHeading icon="book" title="Extrato" statement>
            {data?.entries && <span className={styles.statementCount}>{rows.length} {rows.length === 1 ? "movimento" : "movimentos"}</span>}
          </FinancialHeading>
          {canImportStatement && token && <TreasuryBankStatements token={token}
            accounts={banks}
            entries={entries}
            canReconcile={canWrite}
            accountsLoading={!data && !failure}
            accountsError={data?.accountsNote || failure} />}
          <FilterDisclosure count={statementFilterCount} search={<WorkspaceSearch
            aria-label="Buscar movimento" value={query} placeholder="Buscar movimento"
            onChange={event => { setQuery(event.target.value); setPage(1); }} />}>
            <div className={styles.filterFields}>
              {scopeFilters}
              <div className={`${styles.toolbar} ${styles.statementFilters}`} role="group" aria-label="Filtros do extrato">
                  <label>Conta<select value={bankFilter} onChange={event => { setBankFilter(event.target.value); setPage(1); }}><option value="">Todas</option>{banks.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
                  <label>Canal<select value={channelFilter} onChange={event => { setChannelFilter(event.target.value); setPage(1); }}><option value="">Todos</option>{treasuryChannels.map(channel => <option key={channel.id} value={channel.id}>{channel.name}</option>)}<option value="outras">Outras entradas</option><option value="movimentacao">Outros movimentos</option></select></label>
                  <label>Situação<select value={statementStatus} onChange={event => { setStatementStatus(event.target.value); setPage(1); }}>
                    <option value="">Todas</option><option value="APPROVED">Aprovados</option><option value="PENDING_APPROVAL">Aguardando aprovação</option>
                    <option value="DRAFT">Rascunhos</option><option value="REJECTED">Recusados</option><option value="REVERSED">Estornados</option><option value="reconciled">Conciliados</option>
                  </select></label>
              </div>
            </div>
          </FilterDisclosure>
          {!data && <TreasuryPositionCards state={cards} />}
          {data?.entriesNote && <p role="status">{data.entriesNote}</p>}
          {(statementFilterCount > 0 || query) && <button className={`${ui.workspaceQuiet} ${styles.clearStatement}`}
            type="button" onClick={() => { clearStatementFilters(); setCenter(""); setFrom(""); setTo(""); }}><UIIcon name="close" size={16} /> Limpar filtros do extrato</button>}
          {data?.entries && rows.length === 0 && <p className={styles.expenseEmpty}>Nenhum movimento no período e nos filtros selecionados.</p>}
          {[...movementsByDay].map(([date, movements]) => <section key={date} className={styles.statementDay} aria-label={displayDate(date)}>
            <h3><UIIcon name="calendar" size={16} /><time dateTime={date}>{displayDate(date)}</time></h3>
            {movements.map(entry => {
            const approval = approvalCopy(data?.actorId ?? null, entry, access.kind === "ready" ? access.roles : []);
            const ledgerType = ledgerChannel(entry, accountMap);
            const effect = statementCashEffect(entry, bankIds, bankFilter);
            const direction = { credit: "Entrada", debit: "Saída", transfer: "Entre contas", ledger: "Lançamento contábil" }[effect.kind];
            const bankNames = Array.from(new Set(entry.lines
              .filter(line => bankIds.has(line.accountId))
              .map(line => accountMap.get(line.accountId)?.name).filter(Boolean)));
            const channel = treasuryChannels.find(item => item.id === ledgerType)?.name;
            return <StatementMovement key={entry.id} description={entry.description} details={<>
              <dl>{entry.lines.map((line, index) => <div key={index}>
                <dt>{line.side === "DEBIT" ? "Débito" : "Crédito"} · {accountMap.get(line.accountId)?.name ?? "Conta"}</dt><dd>{formatBRL(line.cents)}</dd>
              </div>)}</dl>
              {canWrite && entry.status === "PENDING_APPROVAL" && entry.approvalFlow !== "TREASURER_THEN_PASTOR" && <small>{approval.text}</small>}
            </>} actions={<>
              {canWrite && (entry.status === "DRAFT" || entry.status === "REJECTED") && <button type="button" className={ui.workspaceSecondary} disabled={busy} onClick={() => void runEntryAction(entry, "submit")}>Enviar para aprovação</button>}
              {canWrite && approval.canApprove && <button type="button" className={ui.workspaceSecondary} disabled={busy} onClick={() => void runEntryAction(entry, "approve")}>Registrar aprovação</button>}
            </>}>
              <div className={styles.movementInfo}>
                <span className={styles.movementIcon} data-direction={effect.kind}><UIIcon name={effect.kind === "credit" || effect.kind === "debit" ? "arrow" : effect.kind === "transfer" ? "refresh" : "book"} size={17} /></span>
                <div><strong>{entry.description}</strong>
                  {(channel || bankNames.length > 0) && <small>{[channel, ...bankNames].filter(Boolean).join(" · ")}</small>}
                  <span className={styles.statementState} data-status={entry.reconciliationId ? "reconciled" : entry.status}>{entry.reconciliationId ? "Conciliado" : entry.approvalFlow === "TREASURER_THEN_PASTOR" ? approval.text : statusLabel(entry.status)}</span>
                </div>
              </div>
              <div className={styles.movementValue} data-direction={effect.kind}>
                <strong className={styles.amount}>{effect.amount === null ? "—" : (effect.kind === "credit" ? "+" : effect.kind === "debit" ? "−" : "") + formatBRL(Math.abs(effect.amount))}</strong>
                <small>{direction}</small>
              </div>
            </StatementMovement>;
            })}
          </section>)}
          {rows.length > 15 && <div className={styles.pagination}>
            <button className={ui.workspaceSecondary} type="button" disabled={statementPage === 1} onClick={() => setPage(statementPage - 1)}><span className={styles.previousPage}><UIIcon name="chevron" size={16} /></span> Anterior</button><span>Página {statementPage} de {Math.ceil(rows.length / 15)}</span>
            <button className={ui.workspaceSecondary} type="button" disabled={statementPage * 15 >= rows.length} onClick={() => setPage(statementPage + 1)}>Próxima <UIIcon name="chevron" size={16} /></button>
          </div>}
        </section>}

        {view === "conciliacao" && <section className={`${styles.card} ${styles.financialSurface}`} aria-label="Conciliações">
          <FinancialHeading icon="check" title="Conciliações" />
          <p>Compare os lançamentos com o extrato da conta. Registre a conferência antes de fechar o período.</p>
          {!data && <TreasuryPositionCards state={cards} />}
          {data?.reconciliationNote && <p role="status">{data.reconciliationNote}</p>}
          {data?.reconciliations && !reconciliations.length && <p>Nenhuma conciliação registrada.</p>}
          {reconciliations.map(item => <article key={item.id} className={styles.row}>
            <div className={styles.reconcileIdentity}><span className={styles.movementIcon}><UIIcon name={item.status === "CLOSED" ? "check" : "clock"} size={17} /></span>
              <div><strong>{item.title || "Conciliação"}</strong><small>{displayDate(item.periodStart)} a {displayDate(item.periodEnd)}</small></div>
            </div>
            <span className={styles.reconcileState} data-closed={item.status === "CLOSED"}>{item.status === "CLOSED" ? "Fechada" : "Em conferência"}</span>
          </article>)}
        </section>}

        {view === "lancar" && canCreateExpense && <section className={styles.card} aria-label="Registrar lançamento">
          <h2>{tab === "despesa" ? "Registrar nova despesa" : tab === "compromisso" ? "Cadastrar conta a pagar" : "Novo lançamento"}</h2>
          {tab === "despesa" && <p className={styles.approvalInfo}>Preencha os dados, revise o lançamento e envie para o pastor. A despesa entra no saldo depois da aprovação.</p>}
          {tab === "despesa" && data && (!expenses.length || !banks.length) && <p className={styles.unavailable} role="alert">Não há categorias de despesas ou contas de caixa/banco disponíveis. Configure o plano de contas antes de registrar a despesa.</p>}
          {tab === "despesa" && demoAccounts && <p className={styles.unavailable} role="status">As categorias e contas bancárias deste ambiente são demonstrativas. Use apenas dados de teste até a homologação do financeiro de produção.</p>}
          {tab === "compromisso" && <p className={styles.approvalInfo}>A conta a pagar passa por conferência da Tesouraria e aprovação do pastor.</p>}
          <label className={styles.movementType}>Tipo de lançamento
            <select value={tab} disabled={busy} onChange={event => {
              const next = tabConfig.find(([id]) => id === event.target.value);
              if (next) { setTab(next[0]); intent.current = ""; openView("lancar", next[0]); }
            }}>
              {displayedTabConfig.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </label>
          {transfer && pendingBalance !== undefined && <p className={styles.note}>Valor em aberto para baixa: <strong>{formatBRL(pendingBalance)}</strong></p>}
          <form key={tab} className={styles.form} onSubmit={onSubmit} onChange={() => { if (tab === "despesa" && !busy) intent.current = ""; }}>
            <label>Data <input type="date" name="date" defaultValue={tab === "despesa" ? churchDate : undefined} required /></label>
            <label>Valor (R$) <input name="amount" inputMode="decimal" required placeholder="0,00" /></label>
            <label className={styles.wide}>Descrição ou referência do comprovante <input name="description" minLength={4} maxLength={180} placeholder={tab === "despesa" ? "Ex. Material para o culto" : undefined} required /></label>
            {tab === "pix" || transfer ? <AccountSelect label="Conta bancária" name="primary" accounts={banks} /> : null}
            {(tab === "compromisso" || tab === "despesa") && <AccountSelect label="Categoria da despesa" name="primary" accounts={expenses} />}
            {tab === "pagar" && <AccountSelect label="Conta a pagar" name="primary" accounts={payables} />}
            {tab === "compromisso" && <AccountSelect label="Conta a pagar" name="secondary" accounts={payables} />}
            {(tab === "pagar" || tab === "despesa") && <AccountSelect label="Conta bancária" name="secondary" accounts={banks} />}
            {tab === "liquidacao" && <label>Taxa do cartão (R$) <input name="fee" inputMode="decimal" placeholder="0,00" /></label>}
            <button className={`${ui.workspacePrimary} ${styles.wide}`} type="submit" disabled={disabled}>{busy ? "Salvando…" : tab === "despesa" ? "Enviar para aprovação do pastor" : "Gravar rascunho"}</button>
          </form>
        </section>}
      </section>
    </section>
  );
}

function AccountSelect({ label, name, accounts }: { label: string; name: string; accounts: Account[] }) {
  return <label>{label}<select name={name} required defaultValue=""><option value="">Selecione</option>
    {accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
  </select></label>;
}

function StatementMovement({ description, children, details, actions }: {
  description: string; children: ReactNode; details: ReactNode; actions: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  return <article className={styles.movement}>
    {children}
    <button className={styles.movementToggle} type="button" aria-label={`Detalhes do movimento: ${description}`}
      aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(value => !value)}>
      <UIIcon name="chevron" size={18} />
    </button>
    <div id={id} hidden={!expanded} className={styles.movementDetails}>
      {details}
    </div>
    <div className={styles.movementActions}>{actions}</div>
  </article>;
}

function FinancialHeading({ icon, title, children, statement = false }: {
  icon: "wallet" | "book" | "check"; title: string; children?: ReactNode; statement?: boolean;
}) {
  return <header className={styles.statementHeader} data-statement={statement || undefined}>
    <div className={styles.statementTitle}>
      <span className={styles.statementIcon}><UIIcon name={icon} size={22} /></span>
      <h2>{title}</h2>
    </div>
    {children}
  </header>;
}

function displayDate(value: string) {
  const iso = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split("-").reverse().join("/") : "Data não informada";
}

function failureState(error: unknown): TreasuryCardState {
  if (error instanceof ApiRequestError && error.status === 403) {
    return { kind: "forbidden", message: "Seu perfil não consulta a tesouraria." };
  }
  return { kind: "error", message: dasError(error) };
}

function MinistryCostCenterSetup({ token, onConfigured }: { token: string; onConfigured: () => void }) {
  const { showFeedback } = useFeedback();
  const [options, setOptions] = useState<Array<{ id: string; name: string }> | null>(null);
  const [ministryId, setMinistryId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function loadOptions() {
    setError("");
    setPending(true);
    try {
      const result = await apiGet<{ ministries: Array<{ id: string; name: string }> }>("/ledger/cost-centers/ministry-options", token);
      setOptions(result.ministries);
    } catch (cause) {
      setError(dasError(cause));
    } finally {
      setPending(false);
    }
  }

  async function configure(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ministryId || pending) return;
    setPending(true);
    setError("");
    try {
      await apiPost(`/ledger/cost-centers/ministry/${encodeURIComponent(ministryId)}`, token);
      setOptions(current => current?.filter(item => item.id !== ministryId) ?? null);
      setMinistryId("");
      onConfigured();
      showFeedback({ tone: "success", title: "Centro de custo configurado", message: "O ministério já pode acompanhar o caixa." });
    } catch (cause) {
      setError(dasError(cause));
    } finally {
      setPending(false);
    }
  }

  return <details className={`${styles.card} ${styles.ministryCenter}`} id="centros-de-custo"
    onToggle={event => { if (event.currentTarget.open && !options && !pending) void loadOptions(); }}>
    <summary>Centros de custo dos ministérios</summary>
    {error && <p role="alert">{error}</p>}
    {options === null && (pending ? <p role="status">Consultando ministérios…</p>
      : error ? <button type="button" className={ui.workspaceQuiet} onClick={() => void loadOptions()}>Tentar novamente</button> : null)}
    {options?.length === 0 && <p>Todos os ministérios já têm centro de custo.</p>}
    {Boolean(options?.length) && <form className={styles.toolbar} onSubmit={configure}>
      <label>Ministério
        <select value={ministryId} required disabled={pending} onChange={event => setMinistryId(event.target.value)}>
          <option value="">Selecione um ministério</option>
          {options?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      <button type="submit" className={ui.workspacePrimary} disabled={pending || !ministryId}>Configurar centro de custo</button>
    </form>}
  </details>;
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
        return [{ id, code: str(row.code), name: str(row.name), type: str(row.type), active: row.active !== false }];
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
      rejectionReason: str(row.rejectionReason) || undefined,
      amountCents: typeof amount === "number" ? amount : null,
      createdByUserId: str(row.createdByUserId),
      firstApprovedByUserId: str(row.firstApprovedByUserId) || null,
      approvalFlow: row.approvalFlow === "TREASURER_THEN_PASTOR" ? "TREASURER_THEN_PASTOR" : "DUAL_APPROVAL",
      costCenterId: str(row.costCenterId) || null,
      reconciliationId: str(row.reconciliationId) || null,
      lines: Array.isArray(row.lines) ? row.lines.flatMap(raw => {
        if (!raw || typeof raw !== "object") return [];
        const line = raw as DasRecord;
        if (!str(line.accountId) || (line.side !== "DEBIT" && line.side !== "CREDIT") ||
            typeof line.amountCents !== "number" || !Number.isSafeInteger(line.amountCents) || line.amountCents <= 0) return [];
        return [{ accountId: str(line.accountId), side: line.side, cents: line.amountCents }];
      }) : [],
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
