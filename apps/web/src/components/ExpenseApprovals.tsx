"use client";

import { useCallback, useEffect, useState } from "react";
import { UIIcon, usePersonaAccess } from "./AppShell";
import { apiGet, apiPost, loadStoredToken } from "../lib/api";
import { formatBRL } from "../lib/das-operations";
import { useActionConfirmation } from "./ui/ActionConfirmation";
import s from "./expense-approvals.module.css";

type PendingExpense = {
  id: string; description: string; amountCents: number; entryDate: string;
  status: string; createdByUserId: string; firstApprovedByUserId: string | null;
  approvalFlow: string;
};
function expenseStep(row: PendingExpense) {
  return row.firstApprovedByUserId ? "PASTOR" : "TESOURARIA";
}

/** A página do pastor mostra apenas despesas para aprovação, nunca o extrato ou contas bancárias. */
export function ExpenseApprovals({ embedded = false }: { embedded?: boolean }) {
  const access = usePersonaAccess();
  const { confirm, confirmation } = useActionConfirmation();
  const [rows, setRows] = useState<PendingExpense[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState("");
  const [revision, setRevision] = useState(0);
  const [token, setToken] = useState<string | null>(null);
  const [actorId, setActorId] = useState<string | null>(null);
  const roles = access.kind === "ready" ? access.roles : [];
  const permitted = roles.includes("PASTOR") || roles.includes("TESOURARIA");
  useEffect(() => { setToken(loadStoredToken()); }, []);
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

  async function approve(row: PendingExpense) {
    if (!token || !actorId || busyId || !permitted) return;
    const required = expenseStep(row);
    if (!roles.includes(required) || row.createdByUserId === actorId
      || row.firstApprovedByUserId === actorId) return;
    if (!(await confirm({
      title: required === "PASTOR" ? "Aprovação pastoral da despesa" : "Conferência da Tesouraria",
      subject: row.description,
      description: "Valor: " + formatBRL(row.amountCents) + ". A aprovação ficará registrada e não poderá ser substituída por outra pessoa.",
      action: "Confirmar aprovação",
    }))) return;
    setBusyId(row.id);
    setNotice("");
    try {
      await apiPost("/ledger/entries/" + encodeURIComponent(row.id) + "/approve", token);
      setNotice(required === "PASTOR"
        ? "Despesa aprovada pelo pastor. O lançamento agora pode integrar o saldo aprovado."
        : "Conferência da Tesouraria registrada. Aguardando aprovação pastoral.");
      setRevision(v => v + 1);
    } catch {
      setError("Não foi possível registrar a aprovação. Verifique sua permissão e atualize a lista.");
    } finally {
      setBusyId("");
    }
  }

  if (access.kind !== "ready") return <section className={s.panel} role="status">Verificando as permissões de acesso…</section>;
  if (!permitted) return <section className={s.panel}>Esta área é exclusiva do tesoureiro e do pastor.</section>;
  return <section className={s.root} aria-label="Despesas aguardando aprovação">
    {confirmation}
    <header className={s.hero}>
      <span>GOVERNANÇA FINANCEIRA · IGREJA DE DEUS</span>
      <h1>{embedded ? "Aprovação de despesas" : "Despesas para aprovação"}</h1>
      <p>Toda despesa precisa da conferência da Tesouraria e da aprovação do pastor da mesma congregação, em registros separados.</p>
    </header>
    {notice && <p className={s.notice} role="status">{notice}</p>}
    {error && <p className={s.error} role="alert">{error}</p>}
    <div className={s.actions}>
      <strong>{rows === null ? "Consultando…" : rows.length + " lançamento(s) pendente(s)"}</strong>
      <button type="button" onClick={() => void load()} disabled={Boolean(busyId)}>Atualizar</button>
    </div>
    {rows?.length === 0 && <div className={s.empty}><UIIcon name="check" size={27}/><strong>Nenhuma despesa pendente</strong><p>Os novos lançamentos aparecerão após serem enviados para aprovação.</p></div>}
    <div className={s.list}>{rows?.map(row => {
      const phase = expenseStep(row);
      const canApprove = roles.includes(phase) && row.createdByUserId !== actorId
        && row.firstApprovedByUserId !== actorId && row.status === "PENDING_APPROVAL";
      return <article key={row.id} className={s.item}>
        <div className={s.itemTitle}><strong>{row.description}</strong><span>{formatBRL(row.amountCents)}</span></div>
        <p>Data do lançamento: {row.entryDate.slice(0,10).split("-").reverse().join("/")}</p>
        <div className={s.stages}>
          <span data-done={Boolean(row.firstApprovedByUserId)}><UIIcon name="check" size={15}/> Tesoureiro</span>
          <span data-done={false}><UIIcon name="shield" size={15}/> Pastor</span>
        </div>
        <div className={s.itemBottom}>
          <small>{row.firstApprovedByUserId ? "Aguardando aprovação pastoral" : "Aguardando conferência da Tesouraria"}</small>
          <button type="button" onClick={() => void approve(row)} disabled={!canApprove || Boolean(busyId)}>
            {busyId === row.id ? "Salvando…" : canApprove ? "Aprovar despesa" : "Aguardando outro responsável"}
          </button>
        </div>
      </article>;
    })}</div>
    <p className={s.foot}>Não é possível aprovar a própria despesa nem substituir as etapas. Sem a segunda aprovação, o lançamento permanece pendente.</p>
  </section>;
}
