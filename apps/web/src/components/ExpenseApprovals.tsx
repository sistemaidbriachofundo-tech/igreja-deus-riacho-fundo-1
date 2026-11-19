"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AppNavLink, UIIcon, usePersonaAccess } from "./AppShell";
import { ApiRequestError, apiGet, apiGetBlob, apiPost, loadStoredToken } from "../lib/api";
import { formatBRL } from "../lib/das-operations";
import { useActionConfirmation } from "./ui/ActionConfirmation";
import { useFeedback } from "./ui/FeedbackProvider";
import { PageHeader } from "./ui/PageHeader";
import s from "./expense-approvals.module.css";
import ui from "./ui/ui.module.css";

type Receipt = { id: string; displayName: string };

type PendingExpense = {
  id: string; description: string; amountCents: number; entryDate: string;
  status: string; createdByUserId: string; firstApprovedByUserId: string | null;
  approvalFlow: string;
  payment?: { paidOn?: string | null } | null;
  payableAccountId?: string | null;
  payable?: boolean;
  secondApprovedAt?: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
};
function expenseStep(row: PendingExpense) {
  return row.firstApprovedByUserId ? "PASTOR" : "TESOURARIA";
}

const reviewedStates = new Set(["APPROVED", "REJECTED", "RETURNED", "REVERSED"]);

function dateLabel(value: string) {
  return value.slice(0, 10).split("-").reverse().join("/");
}

function historyLabel(row: PendingExpense) {
  if (row.status === "REJECTED" || row.status === "RETURNED") return "Devolvida à Tesouraria";
  if (row.status === "REVERSED") return "Estornada";
  if (row.payment?.paidOn) return "Pagamento registrado em " + dateLabel(row.payment.paidOn);
  if (row.payment) return "Pagamento registrado";
  if (row.payable || row.payableAccountId) return "Aprovada · aguardando baixa da Tesouraria";
  return "Aprovada · lançamento contabilizado";
}

/** A consulta pastoral usa a projeção de aprovações autorizada pelo servidor. */
export function ExpenseApprovals({ embedded = false, pastoral = false, onApproved }: { embedded?: boolean; pastoral?: boolean; onApproved?: () => void }) {
  const { showFeedback } = useFeedback();
  const access = usePersonaAccess();
  const { confirm, confirmation } = useActionConfirmation();
  const [rows, setRows] = useState<PendingExpense[] | null>(null);
  const reasons = useRef<Record<string, string>>({});
  const [decisionError, setDecisionError] = useState<{ id: string; text: string } | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [revision, setRevision] = useState(0);
  const [token, setToken] = useState<string | null>(null);
  const [target, setTarget] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const listRequest = useRef(0);
  const historyToggle = useRef<HTMLButtonElement>(null);
  const [receipts, setReceipts] = useState<Record<string, Receipt[]>>({});
  const [actorId, setActorId] = useState<string | null>(null);
  const roles = access.kind === "ready" ? access.roles : [];
  const pastor = roles.includes("PASTOR");
  const readOnly = pastoral && !pastor;
  const permitted = pastor || (pastoral ? roles.includes("PLATFORM_ADMIN") : roles.includes("TESOURARIA"));
  useEffect(() => {
    setToken(loadStoredToken());
    const params = new URLSearchParams(window.location.search);
    setTarget(params.get("despesa") ?? "");
    setShowHistory(pastoral && params.get("historico") === "1");
  }, [pastoral]);
  useEffect(() => {
    if (target && rows) document.getElementById(`despesa-${target}`)?.scrollIntoView({ block: "center" });
  }, [target, rows]);
  useEffect(() => {
    if (!token || !permitted || readOnly) return;
    let active = true;
    void apiGet<{ userId: string }>("/auth/me", token)
      .then(data => { if (active) setActorId(data.userId); })
      .catch(() => { if (active) setActorId(null); });
    return () => { active = false; };
  }, [token, permitted, readOnly]);

  const load = useCallback(async () => {
    if (!token || !permitted) return;
    const requestId = ++listRequest.current;
    try {
      setError("");
      const params = new URLSearchParams();
      if (target) params.set("despesa", target);
      if (showHistory) params.set("history", "1");
      let entries: PendingExpense[];
      if (readOnly && showHistory) {
        const ledger = await Promise.all(["APPROVED", "REJECTED"].map(status =>
          apiGet<{ entries: PendingExpense[] }>(`/ledger/entries?status=${status}`, token),
        ));
        entries = ledger.flatMap(response => response.entries);
      } else {
        const query = params.size ? "?" + params.toString() : "";
        const response = await apiGet<{ entries: PendingExpense[] }>(
          readOnly ? "/ledger/entries?status=PENDING_APPROVAL" : "/ledger/expense-approvals" + query, token,
        );
        entries = response.entries;
      }
      if (listRequest.current !== requestId) return;
      setRows(entries.filter(row => row.approvalFlow === "TREASURER_THEN_PASTOR"
        && (!pastoral || expenseStep(row) === "PASTOR")
        && (showHistory ? reviewedStates.has(row.status) : row.status === "PENDING_APPROVAL")));
    } catch {
      if (listRequest.current !== requestId) return;
      setRows(null);
      setError(showHistory ? "Não foi possível consultar o histórico das despesas. Tente novamente." : "Não foi possível consultar os pedidos de aprovação. Tente novamente.");
    }
  }, [token, permitted, target, pastoral, readOnly, showHistory]);

  const invalidateList = useCallback(() => { listRequest.current++; }, []);
  useEffect(() => { void load(); return invalidateList; }, [load, revision, invalidateList]);

  function changeView(history: boolean) {
    if (history !== showHistory) setRows(null);
    setShowHistory(history);
    const url = new URL(window.location.href);
    if (history) url.searchParams.set("historico", "1");
    else url.searchParams.delete("historico");
    window.history.replaceState(window.history.state, "", url);
  }

  async function listReceipts(entry: string) {
    if (!token) return null;
    try {
      const data = await apiGet<{ attachments: Receipt[] }>(`/ledger/entries/${encodeURIComponent(entry)}/attachments`, token);
      setReceipts(current => ({ ...current, [entry]: data.attachments }));
      return data.attachments;
    } catch {
      setError("Não foi possível consultar os comprovantes desta despesa.");
      return null;
    }
  }

  async function downloadReceipt(entry: string, file: Receipt) {
    if (!token) return;
    try {
      const blob = await apiGetBlob(`/ledger/entries/${encodeURIComponent(entry)}/attachments/${encodeURIComponent(file.id)}`, token);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.displayName;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch {
      showFeedback({ tone: "error", title: "Comprovante indisponível", message: "Atualize a página e tente baixar o arquivo novamente." });
    }
  }

  function receiptLinks(entry: string, files: Receipt[] | null) {
    return <div className={s.receipts}>
      {files === null ? <p>Comprovantes indisponíveis. Volte para atualizar a consulta.</p> :
        files.length === 0 ? <p>Nenhum comprovante anexado.</p> :
        files.map(file => <button className={ui.workspaceSecondary} type="button" key={file.id} onClick={() => void downloadReceipt(entry, file)}><UIIcon name="download" size={16} /> {file.displayName}</button>)}
    </div>;
  }

  async function decide(row: PendingExpense, reject = false) {
    if (!token || !actorId || busyId || !permitted || readOnly || (pastoral && expenseStep(row) !== "PASTOR")) return;
    const required = expenseStep(row);
    if (!roles.includes(required) || row.createdByUserId === actorId
      || row.firstApprovedByUserId === actorId) return;
    setBusyId(row.id);
    setDecisionError(null);
    try {
      const files = receipts[row.id] ?? await listReceipts(row.id);
      if (!(await confirm({
        title: reject ? "Devolver esta despesa?" : required === "PASTOR" ? "Aprovar esta despesa?" : "Confirmar a conferência da despesa?",
        subject: row.description,
        description: reject ? `A despesa de ${formatBRL(row.amountCents)} será devolvida à Tesouraria. O motivo ficará registrado.` : required === "PASTOR"
          ? `O lançamento de ${formatBRL(row.amountCents)} entra no saldo aprovado e a decisão fica no histórico.`
          : `O lançamento de ${formatBRL(row.amountCents)} seguirá para aprovação do pastor.`,
        action: reject ? "Devolver despesa" : required === "PASTOR" ? "Aprovar despesa" : "Confirmar conferência",
        tone: reject ? "danger" : "normal",
        content: <><strong>Comprovantes</strong>{receiptLinks(row.id, files)}
          {reject && <label className={s.reason}>Motivo da devolução <textarea maxLength={500} defaultValue={reasons.current[row.id] ?? ""} onChange={event => { reasons.current[row.id] = event.currentTarget.value; }} /></label>}</>,
      }))) return;
      const endpoint = "/ledger/entries/" + encodeURIComponent(row.id);
      if (reject) await apiPost(endpoint + "/reject", token, { reason: (reasons.current[row.id] ?? "").trim() });
      else await apiPost(endpoint + "/approve", token);
      showFeedback({ tone: "success", title: reject ? "Despesa devolvida" : required === "PASTOR" ? "Despesa aprovada" : "Conferência registrada", message: reject ? "A decisão foi registrada e está disponível para a Tesouraria." : required === "PASTOR" ? "A despesa foi registrada no saldo e no histórico." : "A conferência da Tesouraria foi registrada. Agora a despesa aguarda aprovação pastoral." });
      delete reasons.current[row.id];
      if (pastoral) {
        setTarget(row.id);
        changeView(true);
        requestAnimationFrame(() => historyToggle.current?.focus({ preventScroll: true }));
      }
      setRevision(v => v + 1);
      onApproved?.();
    } catch (error) {
      setDecisionError({ id: row.id, text: error instanceof ApiRequestError && error.status === 409
        ? "Outra pessoa já decidiu ou a despesa mudou de etapa. Atualize a lista."
        : "Não foi possível registrar a decisão. Tente novamente." });
    } finally {
      setBusyId("");
    }
  }

  if (access.kind === "preview" && pastoral) return <PageHeader appearance="workspace" heading="h1" title="Despesas para aprovação" />;
  if (access.kind !== "ready") return <section className={s.panel} role="status">Verificando as permissões de acesso…</section>;
  if (!permitted) return <section className={s.panel}>Esta área é exclusiva do tesoureiro e do pastor.</section>;
  return <section className={s.root} aria-label={showHistory ? "Histórico de despesas" : "Despesas aguardando aprovação"}>
    {confirmation}
    <PageHeader appearance="workspace" heading={embedded ? "h2" : "h1"} title="Despesas para aprovação"
      description={pastoral ? "Consulte as despesas encaminhadas pela Tesouraria para decisão pastoral." : "Confira os lançamentos da congregação e acompanhe a aprovação de cada despesa."}
      actions={(pastor || pastoral) && <AppNavLink className={ui.workspaceSecondary} href="/app/pastoral/">
        <UIIcon name="home" size={16} /> Voltar à Mesa Pastoral
      </AppNavLink>} />
    {pastoral && <div className={ui.workspaceChoices} role="group" aria-label="Visualização de despesas">
      <button type="button" disabled={Boolean(busyId)} aria-pressed={!showHistory} onClick={() => changeView(false)}>Pendentes</button>
      <button type="button" ref={historyToggle} disabled={Boolean(busyId)} aria-pressed={showHistory} onClick={() => changeView(true)}>Histórico</button>
    </div>}
    {error && <p className={s.error} role="alert">{error}</p>}
    <div className={s.actions}>
      <strong>{rows === null ? (error ? "Consulta indisponível" : "Consultando…") : `${rows.length} ${rows.length === 1 ? (showHistory ? "despesa decidida" : "despesa pendente") : (showHistory ? "despesas decididas" : "despesas pendentes")}`}</strong>
      <button className={ui.workspaceSecondary} type="button" onClick={() => void load()} disabled={Boolean(busyId)}><UIIcon name="refresh" size={16} /> Atualizar</button>
    </div>
    {rows?.length === 0 && <div className={s.empty}><UIIcon name="check" size={27}/>
      <strong>{showHistory ? "Nenhuma decisão registrada" : "Nenhuma despesa pendente"}</strong>
      <p>{showHistory ? "As despesas decididas pela Pastoral aparecem aqui." : "Os lançamentos enviados pela Tesouraria aparecem aqui."}</p></div>}
    {!showHistory && target && rows && !rows.some(row => row.id === target) &&
      <p role="status">Esta despesa saiu da fila de aprovação. {pastoral && <button type="button"
        className={ui.workspaceQuiet} onClick={() => changeView(true)}>Consultar histórico</button>}</p>}
    <div className={s.list}>{rows?.map(row => {
      const phase = expenseStep(row);
      const canApprove = !readOnly && actorId && roles.includes(phase) && row.createdByUserId !== actorId
        && row.firstApprovedByUserId !== actorId && row.status === "PENDING_APPROVAL";
      const recordedByTreasury = row.firstApprovedByUserId === row.createdByUserId;
      const decisionAt = row.rejectedAt ?? row.secondApprovedAt;
      return <article key={row.id} className={s.item} id={`despesa-${row.id}`} data-target={target === row.id}>
        <div className={s.itemTitle}><strong>{row.description}</strong><span>{formatBRL(row.amountCents)}</span></div>
        <p>Data do lançamento: {dateLabel(row.entryDate)}</p>
        <div className={s.stages}>
          <span data-done={Boolean(row.firstApprovedByUserId)}><UIIcon name="check" size={15}/> {recordedByTreasury ? "Registrada pela Tesouraria" : "Conferência da Tesouraria"}</span>
          <span data-done={showHistory}><UIIcon name="shield" size={15}/> {showHistory ? historyLabel(row) : "Pastor"}</span>
        </div>
        <details onToggle={event => { if (event.currentTarget.open && !receipts[row.id]) void listReceipts(row.id); }}>
          <summary>Comprovantes</summary>
          {receipts[row.id] && receiptLinks(row.id, receipts[row.id])}
        </details>
        {showHistory && row.rejectionReason && <p>Motivo da devolução: {row.rejectionReason}</p>}
        {decisionError?.id === row.id && <p className={s.error} role="alert">{decisionError.text}</p>}
        <div className={s.itemBottom}>
          {showHistory ? decisionAt && <small>Decisão em {dateLabel(decisionAt)}</small>
            : <small>{row.firstApprovedByUserId ? "Aguardando aprovação pastoral" : "Aguardando conferência da Tesouraria"}</small>}
          {canApprove && <div className={s.itemActions}>
            <button className={ui.workspaceSecondary} type="button" onClick={() => void decide(row, true)} disabled={Boolean(busyId)}>Devolver despesa</button>
            <button className={ui.workspacePrimary} type="button" onClick={() => void decide(row)} disabled={Boolean(busyId)}>
            <UIIcon name="check" size={16} />
            {busyId === row.id ? "Salvando…" : phase === "PASTOR" ? "Aprovar despesa" : "Confirmar conferência"}
          </button></div>}
        </div>
      </article>;
    })}</div>
  </section>;
}
