"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { apiGet, apiPost, loadStoredToken } from "../lib/api";
import { formatChurchWhen } from "../lib/ministry-view";
import { withBasePath } from "../lib/paths";
import { useDialogLifecycle } from "./ui/dialog";
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

export function NotificationCenter({ userId, icon, closeIcon }: { userId: string; icon: ReactNode; closeIcon: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [feed, setFeed] = useState<Feed>();
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLElement>(null);
  const titleId = useId();
  useDialogLifecycle(open, () => setOpen(false), dialog);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const token = loadStoredToken();
    if (!token) return;
    try {
      const value = await apiGet<Feed>(endpoint, token);
      if (!signal?.aborted) { setFeed(value); setError(""); }
    } catch {
      if (!signal?.aborted) setError("Não foi possível consultar as notificações. Tente novamente.");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const update = () => { if (document.visibilityState === "visible") void refresh(controller.signal); };
    update();
    const interval = window.setInterval(update, 90_000);
    window.addEventListener("focus", update);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", update);
    };
  }, [refresh, userId]);

  async function mark(ids: string[]) {
    const token = loadStoredToken();
    if (!token || !ids.length) return;
    setBusy(true);
    setError("");
    try {
      await apiPost(endpoint + "/read", token, { ids });
      await refresh();
    } catch {
      setError("Não foi possível salvar a leitura. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  const visible = feed?.items.filter(item => filter === "all" || !item.readAt) ?? [];
  const unread = feed?.unread ?? 0;
  return <>
    <button type="button" className={s.bell} aria-label={unread ? `Notificações, ${unread} não lidas` : "Notificações"}
      aria-haspopup="dialog" aria-expanded={open} onClick={() => { setOpen(true); void refresh(); }}>
      {icon}{unread > 0 && <span className={s.badge} aria-hidden="true">{unread}</span>}
    </button>
    {open && createPortal(<div className={s.overlay} onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className={s.drawer} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} ref={dialog}>
        <header className={s.header}>
          <div><h2 id={titleId}>Notificações</h2>{unread > 0 && <p>{unread} {unread === 1 ? "não lida" : "não lidas"}</p>}</div>
          <button type="button" className={s.close} aria-label="Fechar notificações" onClick={() => setOpen(false)}>{closeIcon}</button>
        </header>
        <div className={s.controls}>
          <div role="group" aria-label="Filtrar notificações">
            <button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>Todas</button>
            <button type="button" aria-pressed={filter === "unread"} onClick={() => setFilter("unread")}>Não lidas</button>
          </div>
          {unread > 0 && <button className={s.mark} type="button" disabled={busy} onClick={() => void mark(feed?.items.filter(item => !item.readAt).map(item => item.id) ?? [])}>Marcar todas como lidas</button>}
        </div>
        <div className={s.body}>
          {error && <p className={s.failure} role="alert">{error} <button type="button" onClick={() => void refresh()}>Atualizar</button></p>}
          {!feed && !error && <p role="status" className={s.empty}>Carregando notificações…</p>}
          {feed && !visible.length && <div className={s.empty}>{icon}<strong>{filter === "unread" ? "Tudo lido por aqui" : "Nenhuma notificação por enquanto"}</strong></div>}
          {visible.length > 0 && <ul className={s.list}>
            {visible.map(item => <li key={item.id} data-unread={!item.readAt}>
              <div className={s.meta}><span>{item.category}</span><time dateTime={item.createdAt}>{formatChurchWhen(item.createdAt)}</time></div>
              <h3>{item.title}</h3>
              <p>{item.detail}</p>
              {item.state && <span className={s.state}>{item.state}</span>}
              <div className={s.rowActions}>
                <a href={withBasePath(item.href)} onClick={event => {
                  if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || item.readAt) return;
                  event.preventDefault();
                  const href = event.currentTarget.href;
                  void mark([item.id]).finally(() => window.location.assign(href));
                }}>{item.action} <span aria-hidden="true">→</span></a>
                {!item.readAt && <button type="button" disabled={busy} onClick={() => void mark([item.id])}>Marcar como lida</button>}
              </div>
            </li>)}
          </ul>}
        </div>
      </section>
    </div>, document.body)}
  </>;
}
