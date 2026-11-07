"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { ViviStatusResponse } from "@idbrf/shared";
import { withBasePath } from "../lib/paths";
import { publicApiBase } from "../lib/portal-live-data";
import {
  parseRiachinhoAnswer,
  parseRiachinhoStatus,
  prepareRiachinhoPublicRequest,
  requestRiachinhoPublicAnswer,
  riachinhoProviderReady,
  riachinhoPublicEnabled,
} from "../lib/riachinho-public-api";
import s from "./riachinho-public-chat.module.css";

type Message = {
  id: number;
  role: "user" | "assistant";
  content: string;
  provider?: string;
  refused?: boolean;
};

const WELCOME = "Olá! Sou o Riachinho. Posso ajudar você a conhecer o portal da igreja, seus ministérios e a planejar uma visita. Horários e endereços devem ser confirmados nos canais oficiais.";
const OPTIONS = [
  "Quais ministérios posso conhecer?",
  "Como posso planejar minha primeira visita?",
  "Como participar do voluntariado Atmosfera?",
] as const;

const PORTAL_LINKS = [
  { href: "/visita/", label: "Primeira visita" },
  { href: "/ministerios/", label: "Ministérios" },
  { href: "/eventos/", label: "Agenda oficial" },
  { href: "/contato/", label: "Fale com a igreja" },
] as const;

/** Optional visitor assistant; only rendered when explicitly enabled for the HML build. */
export function RiachinhoPublicChat() {
  const enabled = riachinhoPublicEnabled();
  const panelId = useId();
  const chatId = useId();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const openedOnceRef = useRef(false);
  const logRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef("");
  const serial = useRef(0);
  const [open, setOpen] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [status, setStatus] = useState<ViviStatusResponse | null>(null);
  const [offline, setOffline] = useState(false);
  const [consent, setConsent] = useState(false);
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [lastNotice, setLastNotice] = useState("");

  useEffect(() => {
    if (!enabled || !open) return;
    const controller = new AbortController();
    setLoadingStatus(true);
    setOffline(false);
    setError("");
    const base = publicApiBase(process.env.NEXT_PUBLIC_API_URL);
    if (!base) {
      setOffline(true);
      setLoadingStatus(false);
      return () => controller.abort();
    }
    void fetch(base + "/vivi/status", {
      method: "GET", signal: controller.signal, mode: "cors", credentials: "omit",
      cache: "no-store", headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("status unavailable");
        const data = parseRiachinhoStatus(await response.json());
        if (!data) throw new Error("invalid status");
        return data;
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        setStatus(data);
        setLastNotice(data.lgpdNotice);
      })
      .catch(() => {
        if (!controller.signal.aborted) { setOffline(true); setStatus(null); }
      })
      .finally(() => { if (!controller.signal.aborted) setLoadingStatus(false); });
    return () => controller.abort();
  }, [enabled, open]);

  useEffect(() => {
    if (open) {
      openedOnceRef.current = true;
      inputRef.current?.focus();
    } else if (openedOnceRef.current) {
      launcherRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function escapeToClose(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", escapeToClose);
    return () => document.removeEventListener("keydown", escapeToClose);
  }, [open]);

  useEffect(() => {
    if (open && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [open, messages, sending]);

  if (!enabled) return null;

  const realProvider = riachinhoProviderReady(status) && !offline;
  const canSend = realProvider && consent && !sending && !loadingStatus && !!question.trim();

  async function submit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!canSend) return;
    const text = question.trim();
    setSending(true);
    setError("");
    try {
      if (!sessionRef.current) sessionRef.current =
        "visitor-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
      const request = prepareRiachinhoPublicRequest(messages, text, sessionRef.current, consent);
      const base = publicApiBase(process.env.NEXT_PUBLIC_API_URL);
      if (!base) throw new Error("A conexão com o Riachinho não está configurada.");
      const answer = await requestRiachinhoPublicAnswer(base, request);
      setMessages((prev) => [
        ...prev,
        { id: ++serial.current, role: "user", content: text },
        { id: ++serial.current, role: "assistant", content: answer.reply, provider: answer.provider, refused: answer.refused },
      ]);
      setLastNotice(answer.lgpdNotice);
      setQuestion((current) => current.trim() === text ? "" : current);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível consultar o Riachinho.");
    } finally {
      setSending(false);
    }
  }

  function resetConversation() {
    if (sending) return;
    sessionRef.current = "";
    serial.current = 0;
    setMessages([]);
    setQuestion("");
    setConsent(false);
    setError("");
    inputRef.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Escape") { setOpen(false); return; }
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && canSend) {
      event.preventDefault();
      void submit();
    }
  }

  return (
    <div className={s.widget} data-riachinho-public="true">
      {open && (
        <section id={panelId} className={s.panel} role="dialog" aria-modal="false" aria-labelledby={chatId}>
          <header className={s.header}>
            <span className={s.avatar} aria-hidden="true">✦</span>
            <div className={s.headerCopy}>
              <h2 id={chatId}>Riachinho</h2>
              <p>Assistente virtual · Igreja de Deus</p>
            </div>
            <button type="button" className={s.close} onClick={() => setOpen(false)} aria-label="Fechar conversa com o Riachinho">×</button>
          </header>

          <div className={s.status}>
            <span aria-live="polite">
              {loadingStatus ? "Conectando ao Riachinho…" :
                offline ? "Assistente temporariamente indisponível" :
                realProvider ? "Assistente disponível para perguntas públicas" :
                "Assistente indisponível neste ambiente"}
            </span>
            <button type="button" className={s.newChat} onClick={resetConversation} disabled={sending}>Nova conversa</button>
          </div>

          <div className={s.log} role="log" aria-label="Conversa com o Riachinho" aria-live="polite" ref={logRef}>
            <div className={s.answer}>
              <span className={s.author}>Riachinho</span>
              <p>{WELCOME}</p>
            </div>
            {messages.map((message) => (
              <div className={message.role === "user" ? s.question : s.answer} key={message.id}>
                <span className={s.author}>{message.role === "user" ? "Você" : "Riachinho"}</span>
                <p>{message.content}</p>
              </div>
            ))}
            {sending && <p className={s.thinking} role="status">Riachinho está preparando a resposta…</p>}
          </div>

          {messages.length === 0 && (
            <div className={s.quick} aria-label="Perguntas sugeridas">
              {OPTIONS.map((option) => (
                <button type="button" key={option} onClick={() => { setQuestion(option); inputRef.current?.focus(); }}>
                  {option}
                </button>
              ))}
            </div>
          )}

          {error && <p className={s.error} role="alert">{error}</p>}
          {!offline && status?.provider === "mock" && (
            <p className={s.warning}>Este ambiente está em simulação. Nenhuma resposta fictícia será apresentada como IA real.</p>
          )}
          {offline && <p className={s.warning}>Você ainda pode explorar o site e encontrar os canais oficiais de contato normalmente.</p>}

          <nav className={s.portalLinks} aria-label="Informações oficiais da igreja">
            <span>Consulte também no portal:</span>
            <div>{PORTAL_LINKS.map((link) => <a key={link.href} href={withBasePath(link.href)}>{link.label}</a>)}</div>
          </nav>

          <form className={s.form} onSubmit={(event) => void submit(event)}>
            <label className={s.consent}>
              <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
              <span>Autorizo enviar minha pergunta a um provedor de IA. Não incluirei dados pessoais, documentos ou informações pastorais.</span>
            </label>
            <label className={s.promptLabel} htmlFor={panelId + "-question"}>Sua pergunta</label>
            <textarea id={panelId + "-question"} ref={inputRef} value={question} rows={2}
              maxLength={1800} disabled={sending} onKeyDown={onKeyDown}
              placeholder="O que você gostaria de saber sobre a igreja?"
              onChange={(event) => setQuestion(event.target.value)} />
            <div className={s.actions}>
              <span>{question.length}/1800</span>
              <button type="submit" disabled={!canSend}>{sending ? "Consultando…" : "Enviar pergunta"}</button>
            </div>
          </form>
          <details className={s.privacy}>
            <summary>Privacidade e uso responsável</summary>
            <p>{lastNotice || "As perguntas podem ser processadas por um provedor de inteligência artificial. Não compartilhe dados pessoais nem informações confidenciais."}</p>
            <p>Respostas podem conter erros. Confirme horários e programação nos canais oficiais da igreja.</p>
          </details>
        </section>
      )}
      <button ref={launcherRef} type="button" className={s.launcher} aria-expanded={open} aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((current) => !current)}>
        <span className={s.launchIcon} aria-hidden="true">✦</span>
        <span>{open ? "Fechar Riachinho" : "Pergunte ao Riachinho"}</span>
      </button>
    </div>
  );
}
