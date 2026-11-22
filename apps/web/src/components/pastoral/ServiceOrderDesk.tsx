"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { apiGet, apiGetBlob, apiPatch, apiPost, ApiRequestError, loadStoredToken } from "../../lib/api";
import { dasError, churchLocalToISO } from "../../lib/das-operations";
import { AppNavLink, usePersonaAccess } from "../AppShell";
import { Alert } from "../ui/Alert";
import { Modal } from "../ui/Modal";
import { PageHeader } from "../ui/PageHeader";
import ui from "../ui/ui.module.css";
import s from "./service-order.module.css";

type Tab = "calendario" | "roteiro" | "regras" | "culto";
type OrderItem = {
  title: string; minutes?: number | null; responsible?: string | null; roleKey?: string | null;
  responsiblePersonId?: string | null; equipment?: string | null; notes?: string | null; alert?: string | null; startsAt?: string;
};
type Order = {
  id: string; updatedAt: string; title: string; serviceAt: string; notes?: string | null; items: OrderItem[];
  status: "DRAFT" | "APPROVED" | "PUBLISHED"; revision?: number; kind?: "REGULAR" | "SPECIAL"; readPath?: string;
};
type RoleRule = { key: string; title: string; minutes: number; source: "pool" | "roster" | "fixed"; rosterRoleLabels?: string[]; fixedLabel?: string };
type Policy = {
  minGapDays: number; monthlyLimitPerPerson: number; avoidDualDirectionAndPreaching: boolean; skipUnavailable: boolean;
  blessingRoleKey: string; directionRoleKey: string; preachingRoleKey: string;
  slots: Array<{ weekday: number; time: string; title: string }>; roles: RoleRule[]; pools: Record<string, string[]>;
};
type Planned = {
  serviceAt: string; title: string; kind: "REGULAR" | "SPECIAL"; existing: boolean; alerts: string[];
  items: Array<{ title: string; responsible: string | null; alert: string | null; roleKey: string }>;
};
type Plan = { month: string; services: Planned[]; alerts: string[] };
type Briefing = {
  roster: Array<{ roleLabel: string; displayName: string; status: string }>;
  repertoire: Array<{ title: string; musicalKey: string }>;
};
type ExceptionRow = { id: string; serviceAt: string; kind: string; title?: string | null; note: string };

const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const statusLabel = { DRAFT: "Rascunho", APPROVED: "Aprovada", PUBLISHED: "Publicada" };
const displayDate = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "full", timeStyle: "short" });
const clock = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
const inputDate = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
const monthTitle = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", month: "long", year: "numeric" });

export function orderError(error: unknown) {
  if (error instanceof ApiRequestError && error.message.includes("SERVICE_ORDER_DUPLICATE")) {
    return "Já existe uma ordem para este culto. Atualize a lista para abri-la.";
  }
  if (error instanceof ApiRequestError && (error.status === 403 || error.kind === "forbidden")) {
    return "Seu perfil não pode consultar ou alterar a ordem de culto (403).";
  }
  if (error instanceof ApiRequestError && error.status === 404) return "Ordem de culto não encontrada (404).";
  if (error instanceof ApiRequestError && error.kind === "timeout") return "A consulta da ordem de culto excedeu o tempo. Tente novamente.";
  if (error instanceof ApiRequestError && error.kind === "network") return "Sem conexão para consultar a ordem de culto. Verifique a rede e tente novamente.";
  if (error instanceof ApiRequestError && error.status) return `A ordem de culto respondeu HTTP ${error.status}.`;
  return dasError(error);
}

function monthKey(value: string) {
  const formatted = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).format(new Date(value));
  return formatted.slice(0, 7);
}
function dayKey(value: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}
function shiftMonth(year: number, month: number, delta: number) {
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}
function calendarCells(year: number, month: number) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const start = first.getUTCDay();
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Array.from({ length: Math.ceil((start + days) / 7) * 7 }, (_, index) => {
    const day = index - start + 1;
    return day >= 1 && day <= days ? day : null;
  });
}

function editorItem(item?: OrderItem) {
  return {
    key: crypto.randomUUID(), title: item?.title ?? "", minutes: item?.minutes == null ? "" : String(item.minutes),
    responsible: item?.responsible ?? "", roleKey: item?.roleKey ?? "", responsiblePersonId: item?.responsiblePersonId ?? "",
    equipment: item?.equipment ?? "", notes: item?.notes ?? "", alert: item?.alert ?? "",
  };
}

function OrderEditor({ order, token, onClose, onSaved }: {
  order: Order | null; token: string; onClose: () => void; onSaved: (order: Order) => void;
}) {
  const [items, setItems] = useState(() => order?.items.length ? order.items.map(editorItem) : [editorItem()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const base = order ? new Date(order.serviceAt).getTime() : Number.NaN;
  let cursor = base;
  const clocks = items.map((item) => {
    const label = Number.isFinite(cursor) ? clock.format(new Date(cursor)) : "horário ao salvar";
    const minutes = Number(item.minutes);
    if (Number.isFinite(cursor) && Number.isInteger(minutes) && minutes > 0) cursor += minutes * 60_000;
    return label;
  });
  function move(index: number, direction: -1 | 1) {
    setItems((current) => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target]!, next[index]!];
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
    if (!title || !serviceAt || items.some((item) => !item.title.trim())) {
      setError("Preencha o título, o horário do culto e o nome de cada etapa.");
      return;
    }
    const input = {
      title, serviceAt, notes, ...(order ? { expectedUpdatedAt: order.updatedAt } : {}),
      items: items.map((item) => ({
        title: item.title.trim(),
        ...(item.minutes !== "" ? { minutes: Number(item.minutes) } : {}),
        ...(item.responsible.trim() ? { responsible: item.responsible.trim() } : {}),
        ...(item.roleKey.trim() ? { roleKey: item.roleKey.trim() } : {}),
        ...(item.responsiblePersonId.trim() ? { responsiblePersonId: item.responsiblePersonId.trim() } : {}),
        ...(item.equipment.trim() ? { equipment: item.equipment.trim() } : {}),
        ...(item.notes.trim() ? { notes: item.notes.trim() } : {}),
        ...(item.alert.trim() ? { alert: item.alert.trim() } : {}),
      })),
    };
    setBusy(true);
    setError("");
    try {
      const result = order
        ? await apiPatch<Order>(`/service-orders/${encodeURIComponent(order.id)}`, token, input)
        : await apiPost<Order>("/service-orders", token, input);
      onSaved(result);
    } catch (cause) {
      setError(orderError(cause));
    } finally {
      setBusy(false);
    }
  }
  function patch(key: string, change: Partial<ReturnType<typeof editorItem>>) {
    setItems((current) => current.map((row) => row.key === key ? { ...row, ...change } : row));
  }
  return <Modal open appearance="workspace" size="wide" title={order ? "Editar ordem de culto" : "Preparar ordem de culto"}
    description={order?.status === "APPROVED" ? "Salvar alterações devolve o roteiro para nova aprovação." : "Os horários acompanham a duração de cada etapa."}
    onClose={() => { if (!busy) onClose(); }}>
    <form className={s.form} onSubmit={save}>
      <fieldset disabled={busy} className={s.fieldset}>
        <div className={s.grid2}>
          <label>Nome do culto<input name="title" required maxLength={160} defaultValue={order?.title} /></label>
          <label>Dia e hora de Brasília<input name="serviceAt" required type="datetime-local"
            defaultValue={order ? inputDate.format(new Date(order.serviceAt)).replace(" ", "T") : ""} /></label>
        </div>
        <label>Orientações para a equipe<textarea name="notes" rows={2} maxLength={4000} defaultValue={order?.notes ?? ""} /></label>
        <section className={s.stack} aria-label="Sequência do culto">
          <h3>Sequência do culto</h3>
          {items.map((item, index) => <fieldset key={item.key} className={s.step}>
            <legend>Etapa {index + 1} · {clocks[index]}</legend>
            <div className={s.stepGrid}>
              <label>Atividade<input required maxLength={160} value={item.title} onChange={(event) => patch(item.key, { title: event.target.value })} /></label>
              <label>Minutos<input type="number" min={1} max={180} value={item.minutes} onChange={(event) => patch(item.key, { minutes: event.target.value })} /></label>
              <label>Responsável<input maxLength={80} value={item.responsible} onChange={(event) => patch(item.key, { responsible: event.target.value })} /></label>
              <label>Código da função<input maxLength={40} value={item.roleKey} onChange={(event) => patch(item.key, { roleKey: event.target.value })} /></label>
              <label>Identificador da pessoa<input maxLength={80} value={item.responsiblePersonId} onChange={(event) => patch(item.key, { responsiblePersonId: event.target.value })} /></label>
              <label>Microfones e equipamentos<input maxLength={160} value={item.equipment} onChange={(event) => patch(item.key, { equipment: event.target.value })} /></label>
            </div>
            <label>Nota da etapa<textarea maxLength={500} rows={2} value={item.notes} onChange={(event) => patch(item.key, { notes: event.target.value })} /></label>
            <div className={s.actions}>
              <button type="button" className={ui.workspaceQuiet} aria-label={`Subir etapa ${index + 1}`} disabled={index === 0} onClick={() => move(index, -1)}>Subir</button>
              <button type="button" className={ui.workspaceQuiet} aria-label={`Descer etapa ${index + 1}`} disabled={index === items.length - 1} onClick={() => move(index, 1)}>Descer</button>
              <button type="button" className={ui.workspaceQuiet} aria-label={`Remover etapa ${index + 1}`} disabled={items.length === 1} onClick={() => setItems((current) => current.filter((row) => row.key !== item.key))}>Remover</button>
            </div>
          </fieldset>)}
          <div><button type="button" className={ui.workspaceSecondary} disabled={items.length >= 40} onClick={() => setItems((current) => [...current, editorItem()])}>Adicionar etapa</button></div>
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

export function ServiceOrderCentral({
  canEdit, orders, policy, preview, briefing, exceptions, tab, monthLabel, cells, selected, notice, error, busy,
  onTab, onMonth, onSelectDay, onPreview, onGenerate, onEdit, onDecision, onRevise, onPdf, onSavePolicy, onException,
}: {
  canEdit: boolean; orders: Order[]; policy: Policy | null; preview: Plan | null; briefing: Briefing | null;
  exceptions: ExceptionRow[]; tab: Tab; monthLabel: string; cells: Array<number | null>; selected: Order | null;
  notice: string; error: string; busy: boolean; onTab: (tab: Tab) => void; onMonth: (delta: number) => void;
  onSelectDay: (day: number) => void; onPreview: () => void; onGenerate: () => void; onEdit: (order: Order | null) => void;
  onDecision: (order: Order, action: "approve" | "publish") => void; onRevise: (order: Order) => void; onPdf: (order: Order) => void;
  onSavePolicy: (event: FormEvent<HTMLFormElement>) => void; onException: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const openAlerts = (preview?.services ?? []).reduce((sum, service) => sum + service.alerts.length, 0) + (preview?.alerts.length ?? 0);
  const undefinedItems = (preview?.services ?? []).flatMap((service) => service.items).filter((item) => !item.responsible).length;
  const counts = { DRAFT: 0, APPROVED: 0, PUBLISHED: 0 };
  for (const order of orders) counts[order.status] += 1;
  return <div className={s.page}>
    <p className={s.kicker}>PASTORAL</p>
    <PageHeader appearance="workspace" heading="h1" title="Ordem de Culto"
      description="Calendário, roteiro, regras do rodízio e modo culto da congregação. A prévia não publica sozinha."
      actions={<div className={s.actions}>
        {canEdit && <button type="button" className={ui.workspacePrimary} onClick={() => onEdit(null)}>Nova ordem de culto</button>}
        <AppNavLink className={ui.workspaceSecondary} href="/app/pastoral/">Voltar à Pastoral</AppNavLink>
      </div>} />
    <div className={s.tabs} role="tablist" aria-label="Central da ordem de culto">
      {(["calendario", "roteiro", "regras", "culto"] as const).map((id) => <button key={id} type="button" role="tab" id={`aba-${id}`} aria-selected={tab === id} aria-controls={`painel-${id}`} onClick={() => onTab(id)}>
        {id === "calendario" ? "Calendário" : id === "roteiro" ? "Roteiro" : id === "regras" ? "Regras" : "Modo Culto"}
      </button>)}
    </div>
    {notice && <p role="status">{notice}</p>}
    {error && <Alert appearance="workspace" tone="danger" title="Informe da Ordem de Culto">{error}</Alert>}
    <section className={s.kpis} aria-label="Indicadores do mês">
      <article className={s.kpi}><span>Cultos do mês</span><strong>{orders.length}</strong></article>
      <article className={s.kpi}><span>Rascunhos</span><strong>{counts.DRAFT}</strong></article>
      <article className={s.kpi} data-tone="gold"><span>Aprovadas</span><strong>{counts.APPROVED}</strong></article>
      <article className={s.kpi}><span>Publicadas</span><strong>{counts.PUBLISHED}</strong></article>
      <article className={s.kpi} data-tone="alert"><span>Alertas da prévia</span><strong>{openAlerts}</strong></article>
      <article className={s.kpi} data-tone="alert"><span>A definir</span><strong>{undefinedItems}</strong></article>
    </section>
    <div role="tabpanel" id={`painel-${tab}`} aria-labelledby={`aba-${tab}`}>
      {tab === "calendario" && <div className={s.layout}>
        <section className={s.panel} aria-label="Calendário de cultos">
          <div className={s.month}>
            <button type="button" onClick={() => onMonth(-1)} aria-label="Mês anterior">Anterior</button>
            <strong>{monthLabel}</strong>
            <button type="button" onClick={() => onMonth(1)} aria-label="Próximo mês">Próximo</button>
          </div>
          <div className={s.weekdays}>{WEEKDAYS.map((day) => <span key={day}>{day.slice(0, 3)}</span>)}</div>
          <div className={s.grid}>
            {cells.map((day, index) => <button key={index} type="button" className={s.day} data-outside={day == null} disabled={day == null}
              data-selected={selected != null && day != null && dayKey(selected.serviceAt).endsWith(String(day).padStart(2, "0"))}
              onClick={() => day != null && onSelectDay(day)}>
              <small>{day ?? ""}</small>
              {day != null && orders.filter((order) => Number(dayKey(order.serviceAt).slice(-2)) === day).slice(0, 3).map((order) => <i key={order.id} className={s.mark} data-status={order.status} />)}
            </button>)}
          </div>
        </section>
        <section className={s.panel} aria-label="Prévia do mês">
          <h2>Prévia antes de gravar</h2>
          <p className={s.muted}>A prévia respeita indisponibilidade, intervalo, limite e a escala publicada. Sem pessoa válida, a etapa fica como A definir.</p>
          <div className={s.actions}>
            <button type="button" className={ui.workspaceSecondary} disabled={busy} onClick={onPreview}>{busy ? "Consultando…" : "Gerar prévia"}</button>
            {canEdit && <button type="button" className={ui.workspacePrimary} disabled={busy || !preview} onClick={onGenerate}>Gravar rascunhos</button>}
          </div>
          {preview?.alerts.map((alert) => <p key={alert} className={s.alert}>{alert}</p>)}
          <div className={s.list}>{preview?.services.map((service) => <article key={service.serviceAt + service.title} className={s.card}>
            <header><h3>{service.title}</h3><span className={s.status} data-status={service.kind}>{service.existing ? "Já gravado" : service.kind === "SPECIAL" ? "Especial" : "Novo"}</span></header>
            <time dateTime={service.serviceAt}>{displayDate.format(new Date(service.serviceAt))}</time>
            <ul className={s.items}>{service.items.map((item) => <li key={item.roleKey + item.title}><strong>{item.title}</strong><span>{item.responsible ?? "A definir"}</span>{item.alert && <span className={s.alert}>{item.alert}</span>}</li>)}</ul>
          </article>)}</div>
        </section>
      </div>}
      {tab === "roteiro" && <div className={s.list}>{orders.length === 0 && <p className={s.panel}>Nenhuma ordem de culto neste mês.</p>}
        {orders.map((order) => <article key={order.id} className={s.card} data-selected={selected?.id === order.id}>
          <header className={s.cardHeader}><div><h2>{order.title}</h2><time dateTime={order.serviceAt}>{displayDate.format(new Date(order.serviceAt))}</time></div>
            <span className={s.status} data-status={order.status}>{statusLabel[order.status]}</span></header>
          {order.notes && <p className={s.notes}>{order.notes}</p>}
          <ol className={s.items}>{order.items.map((item, index) => <li key={index}><strong>{item.title}</strong>
            <span>{[item.startsAt ? clock.format(new Date(item.startsAt)) : "", item.responsible ?? "A definir", item.minutes ? `${item.minutes} min` : "", item.equipment].filter(Boolean).join(" · ")}</span>
            {item.alert && <span className={s.alert}>{item.alert}</span>}
            {item.notes && <span className={s.muted}>{item.notes}</span>}
          </li>)}</ol>
          {selected?.id === order.id && briefing && <div className={s.stack}>
            <h3>Escala e repertório deste horário</h3>
            {briefing.roster.length === 0 && briefing.repertoire.length === 0 && <p className={s.muted}>Não há escala publicada nem repertório neste horário.</p>}
            {briefing.roster.map((row) => <p key={row.roleLabel + row.displayName}>{row.roleLabel}: {row.displayName} · {row.status === "CONFIRMED" ? "Confirmado" : "Aguardando"}</p>)}
            {briefing.repertoire.map((song) => <p key={song.title}>{song.title} · tom {song.musicalKey}</p>)}
          </div>}
          <div className={s.actions}>
            <button type="button" className={ui.workspaceSecondary} onClick={() => onPdf(order)}>Baixar PDF</button>
            {canEdit && order.status !== "PUBLISHED" && <button type="button" className={ui.workspaceSecondary} onClick={() => onEdit(order)}>Editar</button>}
            {canEdit && order.status === "PUBLISHED" && <button type="button" className={ui.workspaceSecondary} onClick={() => onRevise(order)}>Abrir revisão</button>}
            {canEdit && order.status === "DRAFT" && <button type="button" className={ui.workspacePrimary} onClick={() => onDecision(order, "approve")}>Aprovar roteiro</button>}
            {canEdit && order.status === "APPROVED" && <button type="button" className={ui.workspacePrimary} onClick={() => onDecision(order, "publish")}>Publicar roteiro</button>}
          </div>
        </article>)}
      </div>}
      {tab === "regras" && <div className={s.stack}>
        <form className={`${s.panel} ${s.form}`} key={policy ? JSON.stringify(policy) : "regras"} onSubmit={onSavePolicy}>
          <h2>Regras da congregação</h2>
          <p className={s.muted}>O padrão é quinta às 20h e domingo às 10h e 19h. A bênção é uma função configurável, nunca um nome fixo.</p>
          <fieldset disabled={!canEdit || busy} className={s.fieldset}>
            <div className={s.grid2}>
              <label>Intervalo mínimo em dias<input name="minGapDays" type="number" min={0} max={90} defaultValue={policy?.minGapDays ?? 14} /></label>
              <label>Limite mensal por pessoa<input name="monthlyLimitPerPerson" type="number" min={1} max={31} defaultValue={policy?.monthlyLimitPerPerson ?? 2} /></label>
              <label>Função da bênção<input name="blessingRoleKey" maxLength={40} defaultValue={policy?.blessingRoleKey ?? "bencao"} /></label>
              <label>Função da direção<input name="directionRoleKey" maxLength={40} defaultValue={policy?.directionRoleKey ?? "direcao"} /></label>
              <label>Função da pregação<input name="preachingRoleKey" maxLength={40} defaultValue={policy?.preachingRoleKey ?? "pregacao"} /></label>
            </div>
            <label className={s.check}><input type="checkbox" name="avoidDual" defaultChecked={policy?.avoidDualDirectionAndPreaching !== false} /> Evitar direção e pregação na mesma pessoa</label>
            <label className={s.check}><input type="checkbox" name="skipUnavailable" defaultChecked={policy?.skipUnavailable !== false} /> Não atribuir quem tem indisponibilidade registrada</label>
            <div className={s.stack}>{(policy?.slots ?? []).map((slot, index) => <div key={index} className={s.grid2}>
              <label>Culto {index + 1}<input name={`slot-title-${index}`} defaultValue={slot.title} maxLength={120} /></label>
              <label>Dia 0 a 6 e hora, 0 = domingo<input name={`slot-when-${index}`} defaultValue={`${slot.weekday}|${slot.time}`} /></label>
            </div>)}</div>
            <label>Identificadores do rodízio, um papel por linha no formato funcao:id1,id2
              <textarea name="pools" rows={4} defaultValue={Object.entries(policy?.pools ?? {}).map(([key, ids]) => `${key}:${ids.join(",")}`).join("\n")} />
            </label>
          </fieldset>
          {canEdit ? <button type="submit" className={ui.workspacePrimary} disabled={busy}>Salvar regras</button> : <p>A administração consulta as regras. Só a pastoral grava, aprova e publica.</p>}
        </form>
        <section className={s.panel}>
          <h2>Exceções do mês</h2>
          {exceptions.length === 0 && <p className={s.muted}>Nenhuma exceção registrada neste mês.</p>}
          {exceptions.map((item) => <p key={item.id}>{displayDate.format(new Date(item.serviceAt))} · {item.kind === "SKIP" ? "Não gerar" : "Especial"} · {item.note}</p>)}
          {canEdit && <form className={s.form} onSubmit={onException}>
            <div className={s.grid2}>
              <label>Horário de Brasília<input name="exceptionAt" type="datetime-local" required /></label>
              <label>Tipo<select name="exceptionKind" defaultValue="SPECIAL"><option value="SPECIAL">Culto especial</option><option value="SKIP">Não gerar</option></select></label>
              <label>Título do especial<input name="exceptionTitle" maxLength={120} /></label>
              <label>Registro da exceção<input name="exceptionNote" required minLength={3} maxLength={500} /></label>
            </div>
            <button type="submit" className={ui.workspaceSecondary}>Registrar exceção</button>
          </form>}
        </section>
      </div>}
      {tab === "culto" && <CultoMode order={selected ?? orders.find((order) => order.status !== "DRAFT") ?? orders[0] ?? null} />}
    </div>
  </div>;
}

function CultoMode({ order }: { order: Order | null }) {
  const [step, setStep] = useState(0);
  if (!order) return <section className={s.culto}><h2>Nenhum culto neste mês</h2><p>Gere a prévia ou prepare um roteiro para abrir o modo culto.</p></section>;
  const current = order.items[Math.min(step, order.items.length - 1)];
  return <section className={s.culto} aria-label="Modo culto">
    <p>{displayDate.format(new Date(order.serviceAt))} · {statusLabel[order.status]}</p>
    <h2>{order.title}</h2>
    {current && <div>
      <strong>{current.title}</strong>
      <p>{current.responsible ?? "A definir"}{current.equipment ? ` · ${current.equipment}` : ""}</p>
    </div>}
    <ol>{order.items.map((item, index) => <li key={index} data-current={index === step}><strong>{item.title}</strong><span>{item.startsAt ? clock.format(new Date(item.startsAt)) : ""} · {item.responsible ?? "A definir"}</span></li>)}</ol>
    <div className={s.actions}>
      <button type="button" onClick={() => setStep((value) => Math.max(0, value - 1))}>Etapa anterior</button>
      <button type="button" onClick={() => setStep((value) => Math.min(order.items.length - 1, value + 1))}>Próxima etapa</button>
    </div>
  </section>;
}

export function ServiceOrderDesk() {
  const access = usePersonaAccess();
  const canEdit = access.kind === "ready" && access.roles.includes("PASTOR");
  const permitted = canEdit || (access.kind === "ready" && access.roles.includes("PLATFORM_ADMIN"));
  const now = new Date();
  const initial = monthKey(now.toISOString()).split("-").map(Number);
  const [cursor, setCursor] = useState({ year: initial[0] ?? now.getUTCFullYear(), month: initial[1] ?? now.getUTCMonth() + 1 });
  const [tab, setTab] = useState<Tab>("calendario");
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [preview, setPreview] = useState<Plan | null>(null);
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [exceptions, setExceptions] = useState<ExceptionRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [editor, setEditor] = useState<{ order: Order | null } | null>(null);
  const [decision, setDecision] = useState<{ order: Order; action: "approve" | "publish" } | null>(null);
  const token = permitted ? loadStoredToken() : null;
  useEffect(() => {
    if (!token) return;
    let active = true;
    void Promise.all([
      apiGet<{ orders: Order[] }>("/service-orders", token),
      apiGet<{ policy: Policy }>("/service-orders/policy", token),
      apiGet<{ exceptions: ExceptionRow[] }>(`/service-orders/exceptions?year=${cursor.year}&month=${cursor.month}`, token),
    ]).then(([list, rules, extra]) => {
      if (!active) return;
      setOrders(list.orders);
      setPolicy(rules.policy);
      setExceptions(extra.exceptions);
      setError("");
    }, (cause) => { if (active) { setOrders(null); setError(orderError(cause)); } });
    return () => { active = false; };
  }, [token, revision, cursor.year, cursor.month]);
  const monthOrders = useMemo(() => (orders ?? []).filter((order) => monthKey(order.serviceAt) === `${cursor.year}-${String(cursor.month).padStart(2, "0")}`), [orders, cursor]);
  const selected = monthOrders.find((order) => order.id === selectedId) ?? monthOrders[0] ?? null;
  useEffect(() => {
    if (!token || !selected) return;
    let active = true;
    void apiGet<Briefing & { order: Order }>(`/service-orders/${encodeURIComponent(selected.id)}/briefing`, token)
      .then((result) => { if (active) setBriefing({ roster: result.roster, repertoire: result.repertoire }); }, () => { if (active) setBriefing(null); });
    return () => { active = false; };
  }, [token, selected?.id]);
  async function runPreview() {
    if (!token || busy) return;
    setBusy(true); setError("");
    try { setPreview(await apiPost<Plan>("/service-orders/preview", token, cursor)); setNotice("Prévia atualizada. Nada foi gravado."); }
    catch (cause) { setError(orderError(cause)); }
    finally { setBusy(false); }
  }
  async function runGenerate() {
    if (!token || !canEdit || busy || !preview) return;
    setBusy(true); setError("");
    try {
      const result = await apiPost<{ created: Order[]; skipped: unknown[] }>("/service-orders/generate", token, cursor);
      setNotice(`${result.created.length} rascunho(s) gravado(s). ${result.skipped.length} horário(s) já existiam.`);
      setRevision((value) => value + 1);
    } catch (cause) { setError(orderError(cause)); }
    finally { setBusy(false); }
  }
  async function submitDecision() {
    if (!token || !canEdit || !decision || busy) return;
    setBusy(true); setError("");
    try {
      await apiPost(`/service-orders/${encodeURIComponent(decision.order.id)}/${decision.action}`, token, { expectedUpdatedAt: decision.order.updatedAt });
      setNotice(decision.action === "approve" ? "Ordem de culto aprovada." : "Ordem de culto publicada.");
      setDecision(null);
      setRevision((value) => value + 1);
    } catch (cause) { setError(orderError(cause)); }
    finally { setBusy(false); }
  }
  async function revise(order: Order) {
    if (!token || !canEdit || busy) return;
    setBusy(true); setError("");
    try {
      const reopened = await apiPost<Order>(`/service-orders/${encodeURIComponent(order.id)}/revise`, token, { expectedUpdatedAt: order.updatedAt });
      setNotice("A publicação foi preservada como revisão. O roteiro voltou a rascunho.");
      setEditor({ order: reopened });
      setRevision((value) => value + 1);
    } catch (cause) { setError(orderError(cause)); }
    finally { setBusy(false); }
  }
  async function pdf(order: Order) {
    if (!token) return;
    try {
      const blob = await apiGetBlob(`/service-orders/${encodeURIComponent(order.id)}/pdf`, token);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = "ordem-de-culto.pdf"; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (cause) { setError(orderError(cause)); }
  }
  function savePolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canEdit || !policy || busy) return;
    const form = new FormData(event.currentTarget);
    const pools: Array<{ roleKey: string; personIds: string[] }> = [];
    for (const line of String(form.get("pools") ?? "").split("\n")) {
      const [roleKey, raw] = line.split(":");
      if (!roleKey?.trim()) continue;
      pools.push({ roleKey: roleKey.trim(), personIds: (raw ?? "").split(",").map((id) => id.trim()).filter(Boolean) });
    }
    const slots = policy.slots.map((slot, index) => {
      const when = String(form.get(`slot-when-${index}`) ?? `${slot.weekday}|${slot.time}`).split("|");
      return { weekday: Number(when[0]), time: when[1] ?? slot.time, title: String(form.get(`slot-title-${index}`) ?? slot.title) };
    });
    const body = {
      ...policy, slots, pools,
      minGapDays: Number(form.get("minGapDays")),
      monthlyLimitPerPerson: Number(form.get("monthlyLimitPerPerson")),
      blessingRoleKey: String(form.get("blessingRoleKey") ?? policy.blessingRoleKey),
      directionRoleKey: String(form.get("directionRoleKey") ?? policy.directionRoleKey),
      preachingRoleKey: String(form.get("preachingRoleKey") ?? policy.preachingRoleKey),
      avoidDualDirectionAndPreaching: form.get("avoidDual") === "on",
      skipUnavailable: form.get("skipUnavailable") === "on",
    };
    setBusy(true); setError("");
    void apiPatch<{ policy: Policy }>("/service-orders/policy", token, body).then((result) => {
      setPolicy(result.policy); setNotice("Regras da congregação salvas.");
    }, (cause) => setError(orderError(cause))).finally(() => setBusy(false));
  }
  function addException(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canEdit || busy) return;
    const form = new FormData(event.currentTarget);
    const serviceAt = churchLocalToISO(String(form.get("exceptionAt") ?? ""));
    if (!serviceAt) { setError("Informe o horário de Brasília da exceção."); return; }
    setBusy(true); setError("");
    void apiPost("/service-orders/exceptions", token, {
      serviceAt, kind: String(form.get("exceptionKind") ?? "SPECIAL"),
      title: String(form.get("exceptionTitle") ?? ""), note: String(form.get("exceptionNote") ?? ""),
    }).then(() => { setNotice("Exceção registrada para este horário."); setRevision((value) => value + 1); }, (cause) => setError(orderError(cause))).finally(() => setBusy(false));
  }
  if (access.kind === "ready" && !permitted) return <p role="status">Área reservada à Pastoral e à Administração.</p>;
  if (!orders && !error && permitted) return <p role="status">Carregando ordens de culto…</p>;
  const anchor = new Date(Date.UTC(cursor.year, cursor.month - 1, 15));
  return <>
    <ServiceOrderCentral canEdit={canEdit} orders={monthOrders} policy={policy} preview={preview} briefing={briefing} exceptions={exceptions}
      tab={tab} monthLabel={monthTitle.format(anchor)} cells={calendarCells(cursor.year, cursor.month)} selected={selected}
      notice={notice} error={error} busy={busy} onTab={setTab} onMonth={(delta) => { setPreview(null); setCursor((current) => shiftMonth(current.year, current.month, delta)); }}
      onSelectDay={(day) => {
        const match = monthOrders.find((order) => Number(dayKey(order.serviceAt).slice(-2)) === day);
        setSelectedId(match?.id ?? null);
        if (match) setTab("roteiro");
      }}
      onPreview={() => void runPreview()} onGenerate={() => void runGenerate()} onEdit={(order) => setEditor({ order })}
      onDecision={(order, action) => { setError(""); setDecision({ order, action }); }} onRevise={(order) => void revise(order)} onPdf={(order) => void pdf(order)}
      onSavePolicy={savePolicy} onException={addException} />
    {editor && token && <OrderEditor key={editor.order?.id ?? "new"} order={editor.order} token={token} onClose={() => setEditor(null)}
      onSaved={() => { setEditor(null); setNotice("Rascunho salvo."); setRevision((value) => value + 1); }} />}
    {decision && <Modal open appearance="workspace" title={decision.action === "approve" ? "Aprovar ordem de culto?" : "Publicar ordem de culto?"}
      description={decision.order.title} onClose={() => { if (!busy) setDecision(null); }}>
      <button type="button" className={ui.workspacePrimary} disabled={busy} onClick={() => void submitDecision()}>
        {busy ? "Registrando…" : decision.action === "approve" ? "Confirmar aprovação" : "Confirmar publicação"}
      </button>
    </Modal>}
  </>;
}
