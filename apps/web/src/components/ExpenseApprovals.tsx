"use client";

import { useCallback, useEffect, useState } from "react";
import { UIIcon, usePersonaAccess } from "./AppShell";
import { apiGet, apiGetBlob, apiPost, loadStoredToken } from "../lib/api";
import { formatBRL } from "../lib/das-operations";
import { useActionConfirmation } from "./ui/ActionConfirmation";
import { useFeedback } from "./ui/FeedbackProvider";
import { PageHeader } from "./ui/PageHeader";
import s from "./expense-approvals.module.css";

type Receipt = { id: string; displayName: string };

type PendingExpense = {
  id: string; description: string; amountCents: number; entryDate: string;
  status: string; createdByUserId: string; firstApprovedByUserId: string | null;
  approvalFlow: string;
};
function expenseStep(row: PendingExpense) {
  return row.firstApprovedByUserId ? "PASTOR" : "TESOURARIA";
}

/** A página do pastor mostra apenas despesas para aprovação, nunca o extrato ou contas bancárias. */
export function ExpenseApprovals({ embedded = false, onApproved }: { embedded?: boolean; onApproved?: () => void }) {
  const { showFeedback } = useFeedback();
  const access = usePersonaAccess();
  const { confirm, confirmation } = useActionConfirmation();
  const [rows, setRows] = useState<PendingExpense[] | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [revision, setRevision] = useState(0);
  const [token, setToken] = useState<string | null>(null);
  const [target, setTarget] = useState("");
  const [receipts, setReceipts] = useState<Record<string, Receipt[]>>({});
  const [actorId, setActorId] = useState<string | null>(null);
  const roles = access.kind === "ready" ? access.roles : [];
  const permitted = roles.includes("PASTOR") || roles.includes("TESOURARIA");
  useEffect(() => {
    setToken(loadStoredToken());
    setTarget(new URLSearchParams(window.location.search).get("despesa") ?? "");
  }, []);
  useEffect(() => {
    if (target && rows) document.getElementById(`despesa-${target}`)?.scrollIntoView({ block: "center" });
  }, [target, rows]);
  useEffect(() => {
    if (!token || !permitted) return;
    let active = true;
    void apiGet<{ userId: string }>("/auth/me", token)
      .then(data => { if (active) setActorId(data.userId); })
      .catch(() => { if (active) setActorId(null); });
    return () => { active = false; };
  }, [token, permitted]);

  const load = useCallback(async () => {
    if (!token || !permitted) return;
    try {
      setError("");
      const response = await apiGet<{ entries: PendingExpense[] }>("/ledger/expense-approvals", token);
      setRows(response.entries.filter(row => row.approvalFlow === "TREASURER_THEN_PASTOR"));
    } catch {
      setRows(null);
      setError("Não foi possível consultar os pedidos de aprovação. Tente novamente.");
    }
  }, [token, permitted]);

  useEffect(() => { void load(); }, [load, revision]);

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
        files.map(file => <button type="button" key={file.id} onClick={() => void downloadReceipt(entry, file)}>{file.displayName}</button>)}
    </div>;
  }

  async function decide(row: PendingExpense, reject = false) {
    if (!token || !actorId || busyId || !permitted) return;
    const required = expenseStep(row);
    if (!roles.includes(required) || row.createdByUserId === actorId
      || row.firstApprovedByUserId === actorId) return;
    setBusyId(row.id);
    try {
      const files = receipts[row.id] ?? await listReceipts(row.id);
      let reason = "";
      if (!(await confirm({
        title: reject ? "Devolver esta despesa?" : required === "PASTOR" ? "Aprovar esta despesa?" : "Confirmar a conferência da despesa?",
        subject: row.description,
        description: reject ? "A Tesouraria poderá consultar a decisão e o motivo." : required === "PASTOR"
          ? `O lançamento de ${formatBRL(row.amountCents)} entra no saldo aprovado e a decisão fica no histórico.`
          : `O lançamento de ${formatBRL(row.amountCents)} seguirá para aprovação do pastor.`,
        action: reject ? "Devolver despesa" : required === "PASTOR" ? "Aprovar despesa" : "Confirmar conferência",
        tone: reject ? "danger" : "normal",
        content: <><strong>Comprovantes</strong>{receiptLinks(row.id, files)}
          {reject && <label className={s.reason}>Motivo da devolução <textarea maxLength={500} onChange={event => { reason = event.currentTarget.value; }} /></label>}</>,
      }))) return;
      const endpoint = "/ledger/entries/" + encodeURIComponent(row.id);
      if (reject) await apiPost(endpoint + "/reject", token, { reason: reason.trim() });
      else await apiPost(endpoint + "/approve", token);
      showFeedback({ tone: "success", title: reject ? "Despesa devolvida" : required === "PASTOR" ? "Despesa aprovada" : "Conferência registrada", message: reject ? "A decisão foi registrada e está disponível para a Tesouraria." : required === "PASTOR" ? "A despesa foi registrada no saldo e no histórico." : "A conferência da Tesouraria foi registrada. Agora a despesa aguarda aprovação pastoral." });
      setRevision(v => v + 1);
      onApproved?.();
    } catch {
      showFeedback({ tone: "error", title: "Decisão não registrada", message: "Verifique sua permissão e atualize a lista antes de tentar novamente." });
    } finally {
      setBusyId("");
    }
  }

  if (access.kind !== "ready") return <section className={s.panel} role="status">Verificando as permissões de acesso…</section>;
  if (!permitted) return <section className={s.panel}>Esta área é exclusiva do tesoureiro e do pastor.</section>;
  return <section className={s.root} aria-label="Despesas aguardando aprovação">
    {confirmation}
    <PageHeader appearance="workspace" heading={embedded ? "h2" : "h1"} title="Despesas para aprovação"
      description="Confira os lançamentos da congregação e acompanhe a aprovação de cada despesa." />
    {error && <p className={s.error} role="alert">{error}</p>}
    <div className={s.actions}>
      <strong>{rows === null ? (error ? "Consulta indisponível" : "Consultando…") : `${rows.length} ${rows.length === 1 ? "despesa pendente" : "despesas pendentes"}`}</strong>
      <button type="button" onClick={() => void load()} disabled={Boolean(busyId)}>Atualizar</button>
    </div>
    {rows?.length === 0 && <div className={s.empty}><UIIcon name="check" size={27}/><strong>Nenhuma despesa pendente</strong><p>Os lançamentos enviados pela Tesouraria aparecem aqui.</p></div>}
    {target && rows && !rows.some(row => row.id === target) && <p role="status">Esta despesa saiu da fila de aprovação.</p>}
    <div className={s.list}>{rows?.map(row => {
      const phase = expenseStep(row);
      const canApprove = actorId && roles.includes(phase) && row.createdByUserId !== actorId
        && row.firstApprovedByUserId !== actorId && row.status === "PENDING_APPROVAL";
      const recordedByTreasury = row.firstApprovedByUserId === row.createdByUserId;
      return <article key={row.id} className={s.item} id={`despesa-${row.id}`} data-target={target === row.id}>
        <div className={s.itemTitle}><strong>{row.description}</strong><span>{formatBRL(row.amountCents)}</span></div>
        <p>Data do lançamento: {row.entryDate.slice(0,10).split("-").reverse().join("/")}</p>
        <div className={s.stages}>
          <span data-done={Boolean(row.firstApprovedByUserId)}><UIIcon name="check" size={15}/> {recordedByTreasury ? "Registrada pela Tesouraria" : "Conferência da Tesouraria"}</span>
          <span data-done={false}><UIIcon name="shield" size={15}/> Pastor</span>
        </div>
        <details onToggle={event => { if (event.currentTarget.open && !receipts[row.id]) void listReceipts(row.id); }}>
          <summary>Comprovantes</summary>
          {receipts[row.id] && receiptLinks(row.id, receipts[row.id])}
        </details>
        <div className={s.itemBottom}>
          <small>{row.firstApprovedByUserId ? "Aguardando aprovação pastoral" : "Aguardando conferência da Tesouraria"}</small>
          {canApprove && <div className={s.itemActions}>
            <button type="button" onClick={() => void decide(row, true)} disabled={Boolean(busyId)}>Devolver despesa</button>
            <button type="button" onClick={() => void decide(row)} disabled={Boolean(busyId)}>
            {busyId === row.id ? "Salvando…" : phase === "PASTOR" ? "Aprovar despesa" : "Confirmar conferência"}
          </button></div>}
        </div>
      </article>;
    })}</div>
  </section>;
}
