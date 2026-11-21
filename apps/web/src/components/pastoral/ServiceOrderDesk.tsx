"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiGet, apiPatch, apiPost, ApiRequestError, loadStoredToken } from "../../lib/api";
import { dasError, churchLocalToISO } from "../../lib/das-operations";
import { AppNavLink, usePersonaAccess } from "../AppShell";
import { Alert } from "../ui/Alert";
import { Modal } from "../ui/Modal";
import { PageHeader } from "../ui/PageHeader";
import ui from "../ui/ui.module.css";
import s from "./service-order.module.css";

type OrderItem = { title: string; minutes?: number | null; responsible?: string | null };
type Order = {
  id: string;
  updatedAt: string;
  title: string;
  serviceAt: string;
  notes?: string | null;
  items: OrderItem[];
  status: "DRAFT" | "APPROVED" | "PUBLISHED";
};

function orderError(error: unknown) {
  if (error instanceof ApiRequestError && error.message.includes("SERVICE_ORDER_DUPLICATE")) {
    return "Já existe uma ordem para este culto. Atualize a lista para abri-la.";
  }
  return dasError(error);
}

const statusLabel = { DRAFT: "Rascunho", APPROVED: "Aprovada", PUBLISHED: "Publicada" };
const displayDate = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo", dateStyle: "full", timeStyle: "short",
});
const inputDate = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

function orderDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? displayDate.format(date) : "Data indisponível";
}

function editorItem(item?: OrderItem) {
  return {
    key: crypto.randomUUID(),
    title: item?.title ?? "",
    minutes: item?.minutes == null ? "" : String(item.minutes),
    responsible: item?.responsible ?? "",
  };
}

function OrderEditor({ order, token, onClose, onSaved }: {
  order: Order | null; token: string; onClose: () => void; onSaved: (order: Order) => void;
}) {
  const [items, setItems] = useState(() => order?.items.length ? order.items.map(editorItem) : [editorItem()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  function move(index: number, direction: -1 | 1) {
    setItems(current => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") ?? "").trim();
    const serviceAt = churchLocalToISO(String(form.get("serviceAt") ?? ""));
    const notes = String(form.get("notes") ?? "").trim();
    if (!title || !serviceAt || items.some(item => !item.title.trim())) {
      setError("Preencha o título, o horário do culto e o nome de cada etapa.");
      return;
    }
    const input = {
      title, serviceAt, notes, ...(order ? { expectedUpdatedAt: order.updatedAt } : {}),
      items: items.map(item => ({
        title: item.title.trim(),
        ...(item.minutes !== "" ? { minutes: Number(item.minutes) } : {}),
        ...(item.responsible.trim() ? { responsible: item.responsible.trim() } : {}),
      })),
    };
    setBusy(true);
    setError("");
    try {
      const result = order
        ? await apiPatch<Order | { order: Order }>(`/service-orders/${encodeURIComponent(order.id)}`, token, input)
        : await apiPost<Order | { order: Order }>("/service-orders", token, input);
      onSaved("order" in result ? result.order : result);
    } catch (error) {
      setError(orderError(error));
    } finally {
      setBusy(false);
    }
  }

  return <Modal open appearance="workspace" size="wide" title={order ? "Editar ordem de culto" : "Preparar ordem de culto"}
    description={order?.status === "APPROVED" ? "Salvar alterações devolve o roteiro para nova aprovação." : undefined}
    onClose={() => { if (!busy) onClose(); }}>
    <form className={s.form} onSubmit={save}>
      <fieldset disabled={busy} className={s.fieldset}>
        <div className={s.grid}>
          <label>Nome do culto<input name="title" required maxLength={160} defaultValue={order?.title} /></label>
          <label>Dia e hora de Brasília<input name="serviceAt" required type="datetime-local"
            defaultValue={order ? inputDate.format(new Date(order.serviceAt)).replace(" ", "T") : ""} /></label>
        </div>
        <label>Orientações para a equipe<textarea name="notes" rows={2} maxLength={4000} defaultValue={order?.notes ?? ""} /></label>
        <section className={s.form} aria-label="Sequência do culto">
          <h3>Sequência do culto</h3>
          {items.map((item, index) => <fieldset key={item.key} className={s.step}>
            <legend>Etapa {index + 1}</legend>
            <div className={s.stepGrid}>
              <label>Atividade<input required maxLength={160} value={item.title}
                onChange={e => setItems(current => current.map(row => row.key === item.key ? { ...row, title: e.target.value } : row))} /></label>
              <label>Duração em minutos<input type="number" min={1} max={180} value={item.minutes}
                onChange={e => setItems(current => current.map(row => row.key === item.key ? { ...row, minutes: e.target.value } : row))} /></label>
              <label>Responsável<input maxLength={80} value={item.responsible}
                onChange={e => setItems(current => current.map(row => row.key === item.key ? { ...row, responsible: e.target.value } : row))} /></label>
            </div>
            <div className={s.actions}>
              <button type="button" className={ui.workspaceQuiet} aria-label={`Subir etapa ${index + 1}`} disabled={index === 0} onClick={() => move(index, -1)}>Subir</button>
              <button type="button" className={ui.workspaceQuiet} aria-label={`Descer etapa ${index + 1}`} disabled={index === items.length - 1} onClick={() => move(index, 1)}>Descer</button>
              <button type="button" className={ui.workspaceQuiet} aria-label={`Remover etapa ${index + 1}`} disabled={items.length === 1}
                onClick={() => setItems(current => current.filter(row => row.key !== item.key))}>Remover</button>
            </div>
          </fieldset>)}
          <div><button type="button" className={ui.workspaceSecondary} disabled={items.length >= 40}
            onClick={() => setItems(current => [...current, editorItem()])}>Adicionar etapa</button></div>
        </section>
      </fieldset>
      {error && <p role="alert">{error}</p>}
      <div className={s.actions}>
        <button type="submit" className={ui.workspacePrimary} disabled={busy}>{busy ? "Salvando…" : "Salvar rascunho"}</button>
        <button type="button" className={ui.workspaceSecondary} disabled={busy} onClick={onClose}>Cancelar</button>
      </div>
    </form>
  </Modal>;
}

export function ServiceOrderDesk() {
  const access = usePersonaAccess();
  const canEdit = access.kind === "ready" && access.roles.includes("PASTOR");
  const permitted = canEdit || (access.kind === "ready" && access.roles.includes("PLATFORM_ADMIN"));
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [editor, setEditor] = useState<{ order: Order | null } | null>(null);
  const [decision, setDecision] = useState<{ order: Order; action: "approve" | "publish" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const token = permitted ? loadStoredToken() : null;
  useEffect(() => {
    if (!token) return;
    let active = true;
    void apiGet<{ orders: Order[] }>("/service-orders", token).then(
      result => { if (active) { setOrders(result.orders); setError(""); } },
      error => { if (active) { setOrders(null); setError(orderError(error)); } },
    );
    return () => { active = false; };
  }, [token, revision]);

  function update(order: Order) {
    setOrders(current => [...(current ?? []).filter(row => row.id !== order.id), order]);
    setRevision(current => current + 1);
  }

  async function submitDecision() {
    if (!token || !canEdit || !decision || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await apiPost<Order | { order: Order }>(`/service-orders/${encodeURIComponent(decision.order.id)}/${decision.action}`, token, { expectedUpdatedAt: decision.order.updatedAt });
      update("order" in result ? result.order : result);
      setNotice(decision.action === "approve" ? "Ordem de culto aprovada." : "Ordem de culto publicada.");
      setDecision(null);
    } catch (error) {
      setError(orderError(error));
    } finally {
      setBusy(false);
    }
  }

  const upcoming = [...(orders ?? [])].sort((a, b) => b.serviceAt.localeCompare(a.serviceAt));
  return <div className={s.page}>
    <PageHeader appearance="workspace" heading="h1" title="Ordem de Culto"
      description="Organize a sequência dos cultos e acompanhe os roteiros aprovados e publicados."
      actions={<div className={s.actions}>
        {canEdit && token && <button type="button" className={ui.workspacePrimary} onClick={() => setEditor({ order: null })}>Nova ordem de culto</button>}
        <AppNavLink className={ui.workspaceSecondary} href="/app/pastoral/">Voltar à Pastoral</AppNavLink>
      </div>} />
    {permitted && <>
      {notice && <p role="status">{notice}</p>}
      {error && !decision && <Alert appearance="workspace" tone="danger" title="Informe da Ordem de Culto">{error}
        <div><button type="button" className={ui.workspaceSecondary} onClick={() => setRevision(current => current + 1)}>Tentar novamente</button></div></Alert>}
      {!orders && !error && <p role="status">Carregando ordens de culto…</p>}
      {orders?.length === 0 && <p className={ui.workspaceSurface}>Nenhuma ordem de culto cadastrada.</p>}
      <div className={s.list}>{upcoming.map(order => <article key={order.id} className={`${ui.workspaceSurface} ${s.card}`}>
        <header className={s.cardHeader}><div><h2>{order.title}</h2><time dateTime={order.serviceAt}>{orderDate(order.serviceAt)}</time></div>
          <span className={s.status} data-status={order.status}>{statusLabel[order.status]}</span></header>
        {order.notes && <p className={s.notes}>{order.notes}</p>}
        <ol className={s.items}>{order.items.map((item, index) => <li key={index}><strong>{item.title}</strong>
          {(item.responsible || item.minutes) && <span>{[item.responsible, item.minutes ? `${item.minutes} min` : ""].filter(Boolean).join(" · ")}</span>}</li>)}</ol>
        {canEdit && <div className={s.actions}>
          {order.status !== "PUBLISHED" && <button type="button" className={ui.workspaceSecondary} onClick={() => setEditor({ order })}>Editar</button>}
          {order.status === "DRAFT" && <button type="button" className={ui.workspacePrimary} onClick={() => { setError(""); setDecision({ order, action: "approve" }); }}>Aprovar roteiro</button>}
          {order.status === "APPROVED" && <button type="button" className={ui.workspacePrimary}
            onClick={() => { setError(""); setDecision({ order, action: "publish" }); }}>Publicar roteiro</button>}
        </div>}
      </article>)}</div>
    </>}
    {access.kind === "ready" && !permitted && <p role="status">Área reservada à Pastoral e à Administração.</p>}
    {editor && token && <OrderEditor key={editor.order?.id ?? "new"} order={editor.order} token={token} onClose={() => setEditor(null)}
      onSaved={order => { update(order); setEditor(null); setNotice("Rascunho salvo."); }} />}
    {decision && <Modal open appearance="workspace" title={decision.action === "approve" ? "Aprovar ordem de culto?" : "Publicar ordem de culto?"}
      description={decision.order.title} onClose={() => { if (!busy) setDecision(null); }}>
      {error && <p role="alert">{error}</p>}
      <button type="button" className={ui.workspacePrimary} disabled={busy} onClick={() => void submitDecision()}>
        {busy ? "Registrando…" : decision.action === "approve" ? "Confirmar aprovação" : "Confirmar publicação"}
      </button>
    </Modal>}
  </div>;
}
