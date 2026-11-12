"use client";

import { UIIcon, usePersonaAccess } from "./AppShell";

import { useActionConfirmation } from "./ui/ActionConfirmation";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { nextDualApprovalStage } from "@idbrf/shared";
import { ApiRequestError, apiGet, apiPost, loadStoredToken } from "../lib/api";
import { dasError, formatBRL, parseAmountCents, readDasRows, type DasRecord } from "../lib/das-operations";
import { ledgerChannel, summarizeTreasury, treasuryChannels, type TreasuryAccount as Account, type TreasuryEntry as EntryView } from "../lib/treasury-overview";
import { TreasuryOverview } from "./TreasuryOverview";
import { treasuryMovementFromHash, treasuryMovementHash, treasurySectionFromHash, type TreasurySection } from "../lib/treasury-navigation";
import { ExpenseApprovals } from "./ExpenseApprovals";
import { PageHeader } from "./ui/PageHeader";
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
  const access = usePersonaAccess();
  const canWrite = access.kind === "ready" && access.roles.includes("TESOURARIA");
  const canCreateExpense = access.kind === "ready" &&
    (access.roles.includes("TESOURARIA") || access.roles.includes("PLATFORM_ADMIN"));
  const isPastorOnly = access.kind === "ready" && access.roles.includes("PASTOR") && !canCreateExpense;
  const canReviewApprovals = access.kind === "ready" &&
    (access.roles.includes("TESOURARIA") || access.roles.includes("PASTOR"));
  const { confirm, confirmation } = useActionConfirmation();
  const enabled = process.env.NEXT_PUBLIC_HML_ENABLED === "true";
  const [token, setToken] = useState<string | null>(null);
  const [data, setData] = useState<Awaited<ReturnType<typeof loadTreasury>> | null>(null);
  const [failure, setFailure] = useState("");
  const [center, setCenter] = useState<string | null>(null);
  const [view, setView] = useState<TreasurySection>("visao");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [bankFilter, setBankFilter] = useState("");
  const [channelFilter, setChannelFilter] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
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

  const cards: TreasuryCardState = data?.cards ?? (
    !enabled ? { kind: "disabled" } : failure ? { kind: "error", message: failure } : token ? { kind: "loading" } : { kind: "checking" }
  );
  const activeCenter = center ?? "";
  const entries = data?.entries ?? [];
  const accounts = data?.accounts ?? [];
  const accountMap = new Map(accounts.map(account => [account.id, account]));
  const demoAccounts = accounts.some(account => /\(demo\)/i.test(account.name));
  const scopeEntries = entries.filter(entry => !activeCenter || entry.costCenterId === activeCenter);
  const expenseRows = scopeEntries.filter(entry => entry.approvalFlow === "TREASURER_THEN_PASTOR");
  const summary = cards.kind === "ready" && cards.position.countedEntryIds && data?.entries && !data.accountsNote
    ? summarizeTreasury(accounts, entries, cards.position.countedEntryIds, { from, to })
    : null;
  const isSample = data?.centers.some(item => item.id === activeCenter && item.code === "QA-TESOURARIA") === true;
  const validPeriod = !from || !to || from <= to;
  const rows = scopeEntries.filter(entry => {
    if (from && entry.entryDate < from) return false;
    if (to && entry.entryDate > to) return false;
    if (bankFilter && !entry.lines.some(line => line.accountId === bankFilter)) return false;
    if (channelFilter && ledgerChannel(entry, accountMap) !== channelFilter) return false;
    return !query || entry.description.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR"));
  });
  const reconciliations = data?.reconciliations ?? [];

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
    setMessage(null);
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
      setMessage({ text: action === "submit" ? "Lançamento enviado para aprovação." : "Aprovação registrada." });
      setRevision(value => value + 1);
    } catch (error) {
      setMessage({ text: dasError(error), error: true });
    } finally {
      setBusy(false);
    }
  }

  const payables = accounts.filter(account => matches(account, "payable"));
  const banks = accounts.filter(account => matches(account, "cash"));
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
      setMessage({ text: "Confira a descrição, o valor do lançamento e a taxa.", error: true });
      return;
    }
    if (transfer && (!originAccount || pendingBalance === undefined || amountCents > pendingBalance || (feeCents > 0 && !feeAccount))) {
      setMessage({ text: "Confira a conta de origem e o valor em aberto antes de registrar a baixa.", error: true });
      return;
    }
    if (receiving && !revenue) return;
    const common = { entryDate, description, ...(activeCenter ? { costCenterId: activeCenter } : {}) };
    setBusy(true);
    setMessage(null);
    try {
      let success = "Rascunho gravado. Use o extrato para enviar à aprovação.";
      if (tab === "despesa") {
        if (!expenses.some(account => account.id === primary) || !banks.some(account => account.id === secondary)) {
          throw new Error("Escolha uma categoria de despesa e uma conta bancária válidas.");
        }
        if (!(await confirm({
          title: "Enviar despesa ao pastor?",
          subject: description,
          description: `A despesa de ${formatBRL(amountCents)} ficará pendente até a aprovação do pastor.`,
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
      setMessage({ text: success });
      setBankFilter("");
      setChannelFilter("");
      setQuery("");
      setFrom("");
      setTo("");
      openView(tab === "despesa" ? "despesas" : "extrato");
      setRevision(value => value + 1);
    } catch (error) {
      setMessage({ text: dasError(error), error: true });
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

  if (isPastorOnly) return <ExpenseApprovals />;

  return (
    <section className={styles.panel} aria-label="Tesouraria">
      {confirmation}
      <PageHeader appearance="workspace" heading="h1" title="Tesouraria"
        description={isSample ? "Dados de teste de novembro de 2026" : undefined}
        actions={canCreateExpense && view !== "lancar" ? <>
          {canWrite && <button type="button" className={ui.workspaceSecondary} onClick={() => openMovement("pix")}>Novo lançamento</button>}
          <button type="button" className={ui.workspacePrimary} onClick={() => openMovement("despesa")}>
            <UIIcon name="plus" size={17} /> Incluir despesa
          </button>
        </> : undefined}
      />
      <nav className={ui.workspaceTabs} aria-label="Áreas da Tesouraria">
        <button type="button" aria-current={view === "visao" ? "page" : undefined} onClick={() => openView("visao")}><UIIcon name="grid" size={17} /> Visão geral</button>
        <button type="button" aria-current={view === "despesas" ? "page" : undefined} onClick={() => openView("despesas")}><UIIcon name="wallet" size={17} /> Despesas</button>
        <button type="button" aria-current={view === "extrato" ? "page" : undefined} onClick={() => openView("extrato")}><UIIcon name="book" size={17} /> Extrato</button>
        <button type="button" aria-current={view === "conciliacao" ? "page" : undefined} onClick={() => openView("conciliacao")}><UIIcon name="check" size={17} /> Conciliações</button>
        {canReviewApprovals && <button type="button" aria-current={view === "aprovacoes" ? "page" : undefined} onClick={() => openView("aprovacoes")}><UIIcon name="shield" size={17} /> Aprovações</button>}
      </nav>
      {view !== "aprovacoes" && <div className={styles.toolbar}>
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
      </div>}
      {view !== "lancar" && view !== "aprovacoes" && !validPeriod && <p className={styles.unavailable} role="alert">Escolha uma data final posterior ou igual à inicial.</p>}
      {message && <p className={styles.feedback} data-error={message.error ? "true" : undefined} role={message.error ? "alert" : "status"}>{message.text}</p>}
      <section className={styles.viewBody} aria-label="Conteúdo da Tesouraria">
        {view === "aprovacoes" && canReviewApprovals && <ExpenseApprovals embedded onApproved={() => setRevision(value => value + 1)} />}
        {view === "visao" && (summary && cards.kind === "ready" && validPeriod ? (
          <TreasuryOverview position={cards.position} summary={summary}
            onBank={id => { setBankFilter(id); setChannelFilter(""); setQuery(""); openView("extrato"); }}
            onDeposits={() => { setBankFilter(""); setChannelFilter("dinheiro"); setQuery(""); openView("extrato"); }}
            onReconciliation={() => openView("conciliacao")} />
        ) : <TreasuryPositionCards state={cards} />)}

        {view === "despesas" && <section className={styles.card} aria-label="Despesas da congregação">
          <div className={styles.expenseHeading}>
            <div>
              <span className={styles.kicker}>Controle financeiro</span>
              <h2>Despesas da congregação</h2>
              <p className={styles.note}>Registre pagamentos, acompanhe cada solicitação e consulte a decisão pastoral.</p>
            </div>
            {canCreateExpense && <button type="button" className={ui.workspacePrimary} onClick={() => openMovement("despesa")}>
              <UIIcon name="plus" size={17} /> Incluir despesa
            </button>}
          </div>
          <p className={styles.approvalInfo}>Fluxo: <strong>Tesouraria registra → Pastor aprova → Despesa entra no saldo</strong>. Pedidos pendentes não reduzem o caixa.</p>
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
            return <article key={entry.id} className={styles.expenseItem}>
              <div className={styles.expenseInfo}>
                <strong>{entry.description}</strong>
                <small>{displayDate(entry.entryDate)}</small>
                <span className={styles.expenseState} data-status={entry.status}>{workflow}</span>
              </div>
              <strong className={styles.amount}>{entry.amountCents === null ? "—" : formatBRL(entry.amountCents)}</strong>
              {canApproveExpense && <button type="button" className={styles.entryAction} disabled={busy} onClick={() => void runEntryAction(entry, "approve")}>Registrar conferência</button>}
            </article>;
          })}
        </section>}

        {view === "extrato" && <section className={styles.card} aria-label="Extrato e aprovações">
          <h2>Extrato e aprovações</h2>
          <div className={styles.toolbar}>
            <label>Buscar movimento<input type="search" value={query} placeholder="Descrição" onChange={event => { setQuery(event.target.value); setPage(1); }} /></label>
            <label>Conta<select value={bankFilter} onChange={event => { setBankFilter(event.target.value); setPage(1); }}><option value="">Todas</option>{banks.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
            <label>Canal<select value={channelFilter} onChange={event => { setChannelFilter(event.target.value); setPage(1); }}><option value="">Todos</option>{treasuryChannels.map(channel => <option key={channel.id} value={channel.id}>{channel.name}</option>)}</select></label>
          </div>
          {!data && <TreasuryPositionCards state={cards} />}
          {data?.entriesNote && <p role="status">{data.entriesNote}</p>}
          {data?.entries && rows.length === 0 && <p>Nenhum movimento com estes filtros.</p>}
          {rows.slice((page - 1) * 15, page * 15).map(entry => {
            const approval = approvalCopy(data?.actorId ?? null, entry, access.kind === "ready" ? access.roles : []);
            const ledgerType = ledgerChannel(entry, accountMap);
            return <article key={entry.id} className={styles.movement}>
              <div className={styles.movementInfo}>
                <span className={styles.movementIcon}><UIIcon name={ledgerType === "movimentacao" ? "wallet" : "activity"} size={17} /></span>
                <div><strong>{entry.description}</strong><small>{displayDate(entry.entryDate)} · {entry.reconciliationId ? "Conciliado" : entry.approvalFlow === "TREASURER_THEN_PASTOR" ? approval.text : statusLabel(entry.status)}</small></div>
              </div>
              <strong className={styles.amount}>{entry.amountCents === null ? "—" : formatBRL(entry.amountCents)}</strong>
              <details className={styles.movementDetails}><summary>Detalhes</summary>
                {entry.lines.map((line, index) => <p key={index}>{line.side === "DEBIT" ? "Débito" : "Crédito"} · {accountMap.get(line.accountId)?.name ?? "Conta"} · {formatBRL(line.cents)}</p>)}
                {canWrite && entry.status === "PENDING_APPROVAL" && entry.approvalFlow !== "TREASURER_THEN_PASTOR" && <small>{approval.text}</small>}
              </details>
              {canWrite && (entry.status === "DRAFT" || entry.status === "REJECTED") && <button type="button" className={styles.entryAction} disabled={busy} onClick={() => void runEntryAction(entry, "submit")}>Enviar para aprovação</button>}
              {canWrite && approval.canApprove && <button type="button" className={styles.entryAction} disabled={busy} onClick={() => void runEntryAction(entry, "approve")}>Registrar aprovação</button>}
            </article>;
          })}
          {rows.length > 15 && <div className={styles.pagination}>
            <button type="button" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Anterior</button><span>Página {page} de {Math.ceil(rows.length / 15)}</span>
            <button type="button" disabled={page * 15 >= rows.length} onClick={() => setPage(value => value + 1)}>Próxima</button>
          </div>}
        </section>}

        {view === "conciliacao" && <section className={styles.card} aria-label="Conciliações">
          <h2>Conciliações</h2>
          {!data && <TreasuryPositionCards state={cards} />}
          {data?.reconciliationNote && <p role="status">{data.reconciliationNote}</p>}
          {data?.reconciliations && !reconciliations.length && <p>Nenhuma conciliação registrada.</p>}
          {reconciliations.map(item => <article key={item.id} className={styles.row}>
            <div><strong>{item.title || "Conciliação"}</strong><small>{displayDate(item.periodStart)} a {displayDate(item.periodEnd)}</small></div>
            <span className={styles.reconcileState} data-closed={item.status === "CLOSED"}>{item.status === "CLOSED" ? "Fechada" : "Em conferência"}</span>
          </article>)}
        </section>}

        {view === "lancar" && canCreateExpense && <section className={styles.card} aria-label="Registrar lançamento">
          <h2>{tab === "despesa" ? "Registrar nova despesa" : tab === "compromisso" ? "Cadastrar conta a pagar" : "Novo lançamento"}</h2>
          {tab === "despesa" && <p className={styles.approvalInfo}>O administrador ou tesoureiro cadastra a despesa e o pastor da congregação aprova. O saldo só é atualizado após a aprovação.</p>}
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
            <label>Data <input type="date" name="date" required /></label>
            <label>Valor (R$) <input name="amount" inputMode="decimal" required placeholder="0,00" /></label>
            <label className={styles.wide}>Descrição ou referência do comprovante <input name="description" minLength={4} maxLength={180} required /></label>
            {tab === "pix" || transfer ? <AccountSelect label="Conta bancária" name="primary" accounts={banks} /> : null}
            {(tab === "compromisso" || tab === "despesa") && <AccountSelect label="Categoria da despesa" name="primary" accounts={expenses} />}
            {tab === "pagar" && <AccountSelect label="Conta a pagar" name="primary" accounts={payables} />}
            {tab === "compromisso" && <AccountSelect label="Conta a pagar" name="secondary" accounts={payables} />}
            {(tab === "pagar" || tab === "despesa") && <AccountSelect label="Conta bancária" name="secondary" accounts={banks} />}
            {tab === "liquidacao" && <label>Taxa do cartão (R$) <input name="fee" inputMode="decimal" placeholder="0,00" /></label>}
            <button className={styles.wide} type="submit" disabled={disabled}>{busy ? "Salvando…" : tab === "despesa" ? "Enviar para aprovação do pastor" : "Gravar rascunho"}</button>
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
