"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { apiGet, apiPost, loadStoredToken } from "../lib/api";
import { beginClientNavigation, hasAppRouter, pushAppRoute, shouldInterceptAppNavigation } from "../lib/app-navigation";
import { formatChurchWhen } from "../lib/ministry-view";
import { withBasePath } from "../lib/paths";
import { useDialogLifecycle } from "./ui/dialog";
import { UIIcon } from "./ui/UIIcon";
import ui from "./ui/ui.module.css";
import s from "./notification-center.module.css";

type Notice = {
  id: string;
  category: string;
  title: string;
  detail: string;
  action: string;
  href: string;
  createdAt: string;
  readAt: string | null;
  state?: string;
};
type Feed = { items: Notice[]; unread: number };
type Filter = "all" | "unread";
const endpoint = "/notifications";

export function NotificationCenter({ userId, icon, closeIcon, categoryIcons }: {
  userId: string;
  icon: ReactNode;
  closeIcon: ReactNode;
  categoryIcons: Record<string, ReactNode>;
}) {
  const [open, setOpen] = useState(false);
  const [feed, setFeed] = useState<Feed>();
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lastRefresh = useRef(0);
  const dialog = useRef<HTMLElement>(null);
  const titleId = useId();
  const dialogId = useId();
  useDialogLifecycle(open, () => setOpen(false), dialog);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const token = loadStoredToken();
    if (!token) return;
    const request = ++lastRefresh.current;
    try {
      const value = await apiGet<Feed>(endpoint, token);
      if (!signal?.aborted && request === lastRefresh.current) { setFeed(value); setError(""); }
    } catch {
      if (!signal?.aborted && request === lastRefresh.current) setError("Não foi possível consultar as notificações. Tente novamente.");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const update = () => { if (document.visibilityState === "visible") void refresh(controller.signal); };
    update();
    const interval = window.setInterval(update, 90_000);
    document.addEventListener("visibilitychange", update);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", update);
    };
  }, [refresh, userId]);

  async function mark(ids: string[], sync = true) {
    const token = loadStoredToken();
    if (!token || !ids.length) return;
    setBusy(true);
    setError("");
    try {
      await apiPost(endpoint + "/read", token, { ids }, { keepalive: !sync });
      lastRefresh.current += 1;
      const now = new Date().toISOString();
      setFeed(current => {
        if (!current) return current;
        const items = current.items.map(item => ids.includes(item.id) && !item.readAt ? { ...item, readAt: now } : item);
        return { items, unread: items.filter(item => !item.readAt).length };
      });
    } catch {
      if (sync) setError("Não foi possível salvar a leitura. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  const visible = feed?.items.filter(item => filter === "all" || !item.readAt) ?? [];
  const unread = feed?.unread ?? 0;
  return <>
    <button type="button" className={s.bell} aria-label={unread ? `Notificações, ${unread} não lidas` : "Notificações"}
      aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? dialogId : undefined} onClick={() => { setOpen(true); void refresh(); }}>
      {icon}{unread > 0 && <span className={s.badge} aria-hidden="true">{unread}</span>}
    </button>
    {open && createPortal(<div className={s.overlay} onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section id={dialogId} className={s.drawer} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} ref={dialog}>
        <header className={s.header}>
          <div><h2 id={titleId}>Notificações</h2>{unread > 0 && <p>{unread} {unread === 1 ? "não lida" : "não lidas"}</p>}</div>
          <button type="button" className={s.close} aria-label="Fechar notificações" onClick={() => setOpen(false)}>{closeIcon}</button>
        </header>
        <div className={s.controls}>
          <div className={ui.workspaceChoices} role="group" aria-label="Filtrar notificações">
            <button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}><UIIcon name="layers" size={16} />Todas</button>
            <button type="button" aria-pressed={filter === "unread"} onClick={() => setFilter("unread")}><UIIcon name="bell" size={16} />Não lidas</button>
          </div>
          {unread > 0 && <button className={s.mark} type="button" disabled={busy} onClick={() => void mark(feed?.items.filter(item => !item.readAt).map(item => item.id) ?? [])}>Marcar todas como lidas</button>}
        </div>
        <div className={s.body} aria-busy={!feed && !error}>
          {error && <p className={s.failure} role="alert">{error} <button type="button" onClick={() => void refresh()}>Atualizar</button></p>}
          {!feed && !error && <p role="status" className={s.empty}><span className={s.spinner} aria-hidden="true" /> Carregando notificações…</p>}
          {feed && !visible.length && <div className={s.empty}><span className={s.emptyIcon}>{icon}</span><strong>{filter === "unread" ? "Tudo lido por aqui" : "Você está em dia"}</strong><p>{filter === "unread" ? "Abra Todas para consultar o histórico." : "Novas escalas e pendências da sua área aparecem aqui."}</p></div>}
          {visible.length > 0 && <ul className={s.list}>
            {visible.map(item => <li key={item.id} data-unread={!item.readAt}>
              <span className={s.categoryIcon} aria-hidden="true">{categoryIcons[item.category] ?? icon}</span>
              <div className={s.itemContent}>
                <div className={s.meta}><span>{item.category}</span><time dateTime={item.createdAt}>{formatChurchWhen(item.createdAt)}</time></div>
                <h3>{item.title}</h3>
                <p>{item.detail}</p>
                {item.state && <span className={s.state}>{item.state}</span>}
                <div className={s.rowActions}>
                  <a href={withBasePath(item.href)} onClick={event => {
                    if (!shouldInterceptAppNavigation(item.href, event)) return;
                    event.preventDefault();
                    if (!item.readAt) void mark([item.id], false);
                    setOpen(false);
                    if (hasAppRouter()) {
                      beginClientNavigation(item.href);
                      pushAppRoute(item.href);
                    } else {
                      window.location.assign(event.currentTarget.href);
                    }
                  }}>{item.action} <span aria-hidden="true">→</span></a>
                  {!item.readAt && <button type="button" disabled={busy} onClick={() => void mark([item.id])}>Marcar como lida</button>}
                </div>
              </div>
            </li>)}
          </ul>}
        </div>
      </section>
    </div>, document.body)}
  </>;
}
