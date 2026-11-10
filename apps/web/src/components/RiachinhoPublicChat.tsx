"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { ViviChatResponse, ViviStatusResponse } from "@idbrf/shared";
import { withBasePath } from "../lib/paths";
import { publicApiBase } from "../lib/portal-live-data";
import {
  parseRiachinhoAnswer,
  parseRiachinhoStatus,
  parseRiachinhoPublicKnowledgeSources,
  riachinhoKnowledgeSection,
  type RiachinhoPublicKnowledgeSource,
  prepareRiachinhoPublicRequest,
  requestRiachinhoPublicAnswer,
  riachinhoProviderReady,
  riachinhoPublicEnabled,
} from "../lib/riachinho-public-api";
import s from "./riachinho-public-chat.module.css";

/** V2 fields are optional; the PR branch also builds against the previous shared DTO. */
type OptionalKnowledgeAnswer = ViviChatResponse & { knowledgeMiss?: boolean; sources?: unknown };
type OptionalKnowledgeStatus = ViviStatusResponse & { knowledge?: { mode?: string } };

type Message = {
  id: number;
  role: "user" | "assistant";
  content: string;
  provider?: string;
  refused?: boolean;
  knowledgeMiss?: boolean;
  sources?: RiachinhoPublicKnowledgeSource[];
};

const WELCOME = "Olá! Sou o Riachinho. Posso ajudar você a conhecer a Igreja de Deus no Riacho Fundo I e consultar informações públicas sobre nossa agenda. Para horários e detalhes, confira sempre os canais oficiais.";
const OPTIONS = [
  "Onde posso conhecer mais sobre a igreja?",
  "Quais eventos estão na agenda oficial?",
  "Como encontro informações sobre a comunidade?",
] as const;

const PORTAL_LINKS = [
  { href: "/a-igreja/", label: "Quem somos" },
  { href: "/eventos/", label: "Agenda oficial" },
] as const;

const MARK_PATH = "/images/logo-igreja-aprovada.webp";

const PUBLIC_SCOPE = [
  /\b(cpf|rg\b|passaporte)\b/i,
  /\d{3}\.?\d{3}\.?\d{3}-?\d{2}/,
  /\b(prontu[aá]rio|caso pastoral|aconselhamento pastoral|disciplina eclesi[aá]stica)\b/i,
  /\b(lista de membros|dados do membro|telefone do membro|e-?mail do membro|endere[cç]o do membro)\b/i,
  /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i,
  /(?:\+?\d{2}\s?)?\(?\d{2}\)?\s?9\d{4}-?\d{4}/,
  /\b(ignore (as |todas as )?(instru[cç][oõ]es|regras)|system prompt|jailbreak|modo desenvolvedor)\b/i,
];

const EDITORIAL_SCOPE = PUBLIC_SCOPE.filter((_, index) => index !== 4 && index !== 5);

/**
 * Recusa no navegador, antes de qualquer rede, pedidos com dado pessoal,
 * contato ou tentativa de mudar as regras. O servidor continua sendo o limite real.
 */
/** The public transcript stays plain text. Editorial replies keep Título/Alt markers. */
export function formatPublicReply(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/__(.+?)__/g, "$1");
}

export function assistantScopeRefusal(text: string, audience: "public" | "editorial" = "public"): string | null {
  const value = text.trim();
  if (!value) return null;
  const patterns = audience === "public" ? PUBLIC_SCOPE : EDITORIAL_SCOPE;
  if (!patterns.some((pattern) => pattern.test(value))) return null;
  return audience === "public"
    ? "Não enviei esta mensagem. O Riachinho não lê dados de membros, contatos, documentos ou assuntos pastorais. Apague esses dados e pergunte só sobre a igreja no portal."
    : "Não enviei este pedido. O assistente editorial não lê dados de membros, documentos ou assuntos pastorais. Retire esses dados do texto.";
}

function Mark({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={className} src={withBasePath(MARK_PATH)} alt="" width={46} height={46} />
  );
}

/** Optional visitor assistant; only rendered when explicitly enabled for the HML build. */
export function RiachinhoPublicChat() {
  const enabled = riachinhoPublicEnabled();
  const panelId = useId();
  const chatId = useId();
  const statusId = useId();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const openedOnceRef = useRef(false);
  const logRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef("");
  const serial = useRef(0);
  const [open, setOpen] = useState(false);
  const [coversPage, setCoversPage] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [status, setStatus] = useState<ViviStatusResponse | null>(null);
  const [offline, setOffline] = useState(false);
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [lastNotice, setLastNotice] = useState("");

  useEffect(() => {
    const narrow = window.matchMedia("(max-width: 640px)");
    const short = window.matchMedia("(max-height: 520px)");
    const apply = () => setCoversPage(narrow.matches || short.matches);
    apply();
    narrow.addEventListener("change", apply);
    short.addEventListener("change", apply);
    return () => {
      narrow.removeEventListener("change", apply);
      short.removeEventListener("change", apply);
    };
  }, []);

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

  const realProvider = riachinhoProviderReady(status) && !offline;

  useEffect(() => {
    if (!open) {
      if (openedOnceRef.current) launcherRef.current?.focus();
      return;
    }
    openedOnceRef.current = true;
    const frame = window.requestAnimationFrame(() => {
      const field = inputRef.current;
      const active = document.activeElement;
      const idle = active === launcherRef.current || active === closeRef.current || active === document.body || active === panelRef.current;
      if (field && !field.disabled && idle) field.focus();
      else if (!field || field.disabled) closeRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, realProvider]);

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

  const hasPublishedKnowledge = (status as OptionalKnowledgeStatus | null)?.knowledge?.mode === "structured-cms";
  const canSend = realProvider && !sending && !loadingStatus && !!question.trim();
  const availability = loadingStatus
    ? "consultando"
    : offline || !realProvider
      ? "indisponivel"
      : "disponivel";

  async function submit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!canSend) return;
    const text = question.trim();
    const blocked = assistantScopeRefusal(text);
    if (blocked) {
      setError(blocked);
      return;
    }
    setSending(true);
    setError("");
    try {
      if (!sessionRef.current) sessionRef.current =
        "visitor-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
      // O clique em "Enviar pergunta", após a informação visível abaixo, é a ação afirmativa.
      const request = prepareRiachinhoPublicRequest(messages, text, sessionRef.current, true);
      const base = publicApiBase(process.env.NEXT_PUBLIC_API_URL);
      if (!base) throw new Error("A conexão com o Riachinho não está configurada.");
      const answer: OptionalKnowledgeAnswer = await requestRiachinhoPublicAnswer(base, request);
      setMessages((prev) => [
        ...prev,
        { id: ++serial.current, role: "user", content: text },
        {
          id: ++serial.current,
          role: "assistant",
          content: answer.reply,
          provider: answer.provider,
          refused: answer.refused,
          knowledgeMiss: answer.knowledgeMiss === true,
          sources: parseRiachinhoPublicKnowledgeSources(answer.sources),
        },
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

  function keepFocusInside(event: KeyboardEvent<HTMLElement>) {
    if (!coversPage || event.key !== "Tab" || !panelRef.current) return;
    const focusable = [...panelRef.current.querySelectorAll<HTMLElement>(
      "button:not([disabled]), a[href], textarea:not([disabled]), input:not([disabled]), summary",
    )];
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  return (
    <div className={s.widget} data-riachinho-public="true">
      {open && (
        <section
          id={panelId}
          ref={panelRef}
          className={s.panel}
          role="dialog"
          aria-modal={coversPage}
          aria-labelledby={chatId}
          aria-describedby={statusId}
          data-riachinho-state={availability}
          onKeyDown={keepFocusInside}
        >
          <header className={s.header}>
            <span className={s.avatar} aria-hidden="true"><Mark /></span>
            <div className={s.headerCopy}>
              <h2 id={chatId}>Riachinho</h2>
              <p>Informações públicas da igreja</p>
            </div>
            <button ref={closeRef} type="button" className={s.close} onClick={() => setOpen(false)} aria-label="Fechar conversa com o Riachinho">
              <span aria-hidden="true">×</span>
            </button>
          </header>

          <div className={s.status}>
            <span id={statusId} aria-live="polite">
              {loadingStatus ? "Conectando ao Riachinho…" :
                offline ? "Assistente temporariamente indisponível" :
                realProvider ? "Assistente disponível para perguntas públicas" :
                "Assistente indisponível neste ambiente"}
            </span>
            <button type="button" className={s.newChat} onClick={resetConversation} disabled={sending}>Nova conversa</button>
          </div>

          {realProvider && hasPublishedKnowledge && (
            <p className={s.knowledgeStatus}>O Riachinho consulta conteúdos institucionais publicados. Informações ausentes devem ser confirmadas com a igreja.</p>
          )}

          <div className={s.log} role="log" aria-label="Conversa com o Riachinho" aria-live="polite" ref={logRef}>
            <div className={s.answer}>
              <span className={s.author}>Riachinho</span>
              <p>{WELCOME}</p>
            </div>
            {messages.map((message) => (
              <div className={message.role === "user" ? s.question : s.answer} key={message.id}>
                <span className={s.author}>{message.role === "user" ? "Você" : "Riachinho"}</span>
                <p>{message.role === "assistant" ? formatPublicReply(message.content) : message.content}</p>
                {message.role === "assistant" && message.knowledgeMiss && (
                  <p className={s.missingOfficialData} role="status">
                    Não encontramos uma informação oficial publicada para esta pergunta. Confira a programação e os canais da igreja.
                  </p>
                )}
                {message.role === "assistant" && message.sources && message.sources.length > 0 && (
                  <div className={s.knowledgeSources} aria-label="Fontes institucionais consultadas">
                    <strong>Informações oficiais consultadas</strong>
                    <ul>
                      {message.sources.map((source) => {
                        const section = riachinhoKnowledgeSection(source.kind);
                        return <li key={source.kind + ":" + source.slug}>
                          <span>{source.title}</span>
                          {section && ["/", "/a-igreja/", "/eventos/"].includes(section.href) && <a href={withBasePath(section.href)}>{section.label}</a>}
                        </li>;
                      })}
                    </ul>
                  </div>
                )}
              </div>
            ))}
            {sending && <p className={s.thinking} role="status">Riachinho está preparando a resposta…</p>}
          </div>

          {messages.length === 0 && (
            <div className={s.quick} aria-label="Perguntas sugeridas">
              {OPTIONS.map((option) => (
                <button
                  type="button"
                  key={option}
                  disabled={!realProvider || sending}
                  onClick={() => { setQuestion(option); inputRef.current?.focus(); }}
                >
                  {option}
                </button>
              ))}
            </div>
          )}

          {error && <p className={s.error} role="alert">{error}</p>}
          {!loadingStatus && !offline && status && !realProvider && (
            <p className={s.warning}>O Riachinho não está disponível neste ambiente. Nenhuma resposta será inventada.</p>
          )}
          {offline && <p className={s.warning}>Você ainda pode explorar o site e encontrar os canais oficiais de contato normalmente.</p>}

          <nav className={s.portalLinks} aria-label="Informações oficiais da igreja">
            <span>Consulte também no portal:</span>
            <div>{PORTAL_LINKS.map((link) => <a key={link.href} href={withBasePath(link.href)}>{link.label}</a>)}</div>
          </nav>

          <form className={s.form} onSubmit={(event) => void submit(event)}>
            <label className={s.promptLabel} htmlFor={panelId + "-question"}>Sua pergunta</label>
            <textarea id={panelId + "-question"} ref={inputRef} value={question} rows={2}
              maxLength={1800} disabled={!realProvider || sending} onKeyDown={onKeyDown}
              placeholder={realProvider ? "O que você gostaria de saber sobre a igreja?" : "O assistente não está disponível neste ambiente"}
              onChange={(event) => setQuestion(event.target.value)} />
            <div className={s.actions}>
              <span>{question.length}/1800</span>
              <button type="submit" disabled={!canSend}>{sending ? "Consultando…" : "Enviar pergunta"}</button>
            </div>
            <p className={s.sendNotice}>Ao enviar, sua pergunta será processada por IA. Não compartilhe dados pessoais ou informações confidenciais.</p>
          </form>
          <details className={s.privacy}>
            <summary>Privacidade e uso responsável</summary>
            <p>{lastNotice || "As perguntas podem ser processadas por um provedor de inteligência artificial. Não compartilhe dados pessoais nem informações confidenciais."}</p>
            <p>O Riachinho não consulta fichas, contatos ou conversas internas. Respostas podem conter erros. Confirme horários e programação nos canais oficiais da igreja.</p>
          </details>
        </section>
      )}
      <button ref={launcherRef} type="button" className={s.launcher} aria-expanded={open} aria-controls={open ? panelId : undefined}
        title={open ? "Fechar conversa" : "Conversar com o Riachinho"} aria-label={open ? "Fechar conversa com o Riachinho" : "Conversar com o Riachinho"}
        onClick={() => setOpen((current) => !current)}>
        <span className={s.launchIcon} aria-hidden="true"><Mark /></span>
        <span className={s.launchLabel}>{open ? "Fechar" : "Riachinho"}</span>
      </button>
    </div>
  );
}
