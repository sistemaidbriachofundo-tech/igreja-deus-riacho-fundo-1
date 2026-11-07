"use client";

import { useEffect, useId, useRef, useState } from "react";
import { getApiBaseUrl } from "../lib/api";
import type { ViviChatRequest, ViviChatResponse, ViviStatusResponse } from "@idbrf/shared";
import type { SiteLayout } from "../lib/site-layout";
import { parseRiachinhoAnswer } from "../lib/riachinho-public-api";
import {
  parseRiachinhoSuggestion,
  type RiachinhoParsedSuggestion,
  type RiachinhoSuggestionTarget,
} from "../lib/riachinho-suggestion";
import s from "./vivi-editorial-assistant.module.css";

type Status = ViviStatusResponse;
type Answer = ViviChatResponse;

type Intent = "revisar" | "chamada" | "galeria" | "alt" | "comunicacao" | "livre";

type ChatItem = {
  id: string;
  role: "user" | "assistant";
  content: string;
  answer?: Answer;
  intent?: Intent;
};

const GREETING =
  "Olá! Eu sou o Riachinho, assistente editorial da Igreja de Deus no Riacho Fundo I. Posso ajudar com redação pública, comunicação institucional, títulos e textos alternativos. A publicação continua com a sua equipe.";

const QUICK: { id: Intent; label: string; target: RiachinhoSuggestionTarget }[] = [
  { id: "revisar", label: "Revisar capa", target: "hero" },
  { id: "chamada", label: "Títulos criativos", target: "hero" },
  { id: "galeria", label: "Textos da galeria", target: "gallery" },
  { id: "alt", label: "Textos alt", target: "alts" },
  { id: "comunicacao", label: "Tom da comunicação", target: "hero" },
];

function intentPrompt(intent: Intent, layout: SiteLayout): { text: string; target: RiachinhoSuggestionTarget } {
  const shared = [
    "Você auxilia um editor autorizado do portal da Igreja de Deus Riacho Fundo I.",
    "Sugira exclusivamente redação para conteúdo público institucional, com linguagem acolhedora e objetiva — sem tom infantil.",
    "Não invente horários, endereços, eventos, resultados, testemunhos ou fatos não confirmados.",
    "Não afirme que analisou imagens; trabalhe só com o texto fornecido.",
    "Não execute nenhuma alteração; responda em português e deixe a pessoa revisar.",
    "Quando fizer proposta editável, use o formato:\nTítulo: …\nDestaque: …\nDescrição: …",
  ];

  if (intent === "alt") {
    return {
      target: "alts",
      text: [
        ...shared,
        "Sugira textos alternativos (acessibilidade) para as quatro fotos da galeria, sem inventar pessoas identificáveis.",
        "Use o formato:\nAlt 1: …\nAlt 2: …\nAlt 3: …\nAlt 4: …",
        ...layout.gallery.items.map(
          (item, i) =>
            `Foto ${i + 1} — título «${item.title}», legenda «${item.subtitle}», alt atual «${item.alt}».`,
        ),
      ].join("\n"),
    };
  }

  if (intent === "galeria") {
    return {
      target: "gallery",
      text: [
        ...shared,
        "Sugira título, destaque e descrição da galeria de fotografias.",
        "Título atual: " + layout.gallery.title,
        "Destaque atual: " + layout.gallery.accent,
        "Descrição atual: " + layout.gallery.description,
      ].join("\n"),
    };
  }

  if (intent === "chamada") {
    return {
      target: "hero",
      text: [
        ...shared,
        "Sugira três alternativas curtas de título/destaque para a capa, preservando a identidade da igreja. Escolha uma preferida e formate com Título/Destaque/Descrição.",
        "Título atual: " + layout.hero.title,
        "Destaque atual: " + layout.hero.accent,
        "Descrição atual: " + layout.hero.description,
      ].join("\n"),
    };
  }

  if (intent === "comunicacao") {
    return {
      target: "hero",
      text: [
        ...shared,
        "Reescreva a apresentação da capa com tom de comunicação institucional da igreja: acolhedor, claro e convidativo a uma visita presencial.",
        "Título atual: " + layout.hero.title,
        "Destaque atual: " + layout.hero.accent,
        "Descrição atual: " + layout.hero.description,
      ].join("\n"),
    };
  }

  return {
    target: "hero",
    text: [
      ...shared,
      "Revise a clareza e fluidez da capa. Apresente uma proposta de título, destaque e descrição sem acrescentar fatos.",
      "Título atual: " + layout.hero.title,
      "Destaque atual: " + layout.hero.accent,
      "Descrição atual: " + layout.hero.description,
    ].join("\n"),
  };
}

export function ViviEditorialAssistant({
  token,
  layout,
  onApplySuggestion,
}: {
  token: string;
  layout: SiteLayout;
  onApplySuggestion?: (suggestion: RiachinhoParsedSuggestion) => void;
}) {
  const listId = useId();
  const chatRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [statusError, setStatusError] = useState(false);
  const [intent, setIntent] = useState<Intent>("revisar");
  const [consent, setConsent] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatItem[]>([
    { id: "greeting", role: "assistant", content: GREETING },
  ]);

  useEffect(() => {
    const ctrl = new AbortController();
    void fetch(getApiBaseUrl() + "/vivi/status", {
      signal: ctrl.signal,
      credentials: "omit",
      mode: "cors",
      cache: "no-store",
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("Riachinho indisponível");
        return res.json() as Promise<Status>;
      })
      .then((result) => {
        if (!ctrl.signal.aborted) {
          setStatus(result);
          setStatusError(false);
        }
      })
      .catch(() => {
        if (!ctrl.signal.aborted) {
          setStatusError(true);
          setError("Não foi possível consultar o Riachinho. Você pode continuar editando o site offline.");
        }
      });
    return () => ctrl.abort();
  }, []);

  useEffect(() => {
    const el = chatRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  const realAi = Boolean(
    status &&
      ((status.provider === "manus" && status.manusUrlConfigured && status.manusKeyConfigured) ||
        (status.provider === "gemini" && status.geminiKeyConfigured)),
  );
  const apiOk = Boolean(status) && !statusError;
  const canSend = apiOk && realAi && consent && !busy;

  async function ask(nextIntent: Intent, freeText?: string) {
    if (!canSend) return;
    const built =
      nextIntent === "livre"
        ? {
            target: "hero" as const,
            text: [
              "Você auxilia um editor autorizado do portal da Igreja de Deus Riacho Fundo I.",
              "Responda em português, com tom acolhedor e não infantil.",
              "Escopo: redação pública, comunicação institucional, títulos e alt text. Sem vision de imagens. Sem inventar fatos.",
              "Pedido: " + (freeText ?? "").trim(),
            ].join("\n"),
          }
        : intentPrompt(nextIntent, layout);

    const userVisible =
      nextIntent === "livre"
        ? (freeText ?? "").trim()
        : QUICK.find((q) => q.id === nextIntent)?.label ?? "Pedido editorial";

    const content = built.text.slice(0, 1950);
    const userId = `u-${Date.now()}`;
    setBusy(true);
    setError("");
    setMessages((prev) => [...prev, { id: userId, role: "user", content: userVisible, intent: nextIntent }]);
    try {
      const res = await fetch(getApiBaseUrl() + "/vivi/chat", {
        method: "POST",
        mode: "cors",
        credentials: "omit",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
          Accept: "application/json",
        },
        body: JSON.stringify({
          messages: [{ role: "user", content }],
          consentAiProcessing: true,
          sessionId: "site-riachinho",
        } satisfies ViviChatRequest),
      });
      if (!res.ok) {
        throw new Error(
          res.status === 429
            ? "Muitas solicitações. Aguarde e tente novamente."
            : res.status === 403
              ? "Sem permissão para usar o Riachinho."
              : "Não foi possível consultar o Riachinho (" + res.status + ").",
        );
      }
      const answer = parseRiachinhoAnswer(await res.json().catch(() => null));
      if (!answer || answer.provider === "mock")
        throw new Error("O Riachinho não retornou uma resposta real válida. Seu texto foi preservado.");
      if (nextIntent === "livre" && freeText?.trim()) {
        // Clear only the request that succeeded; preserve any newer text typed while waiting.
        setDraft((current) => current.trim() === freeText.trim() ? "" : current);
      }
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: answer.reply,
          answer,
          intent: nextIntent,
        },
      ]);
    } catch (err) {
      // A failed prompt stays editable and is not duplicated in conversation history.
      setMessages((prev) => prev.filter((item) => item.id !== userId));
      setError(err instanceof Error ? err.message : "Assistente indisponível.");
    } finally {
      setBusy(false);
    }
  }

  async function copy(item: ChatItem) {
    try {
      await navigator.clipboard.writeText(item.content);
      setCopiedId(item.id);
    } catch {
      setError("Não foi possível copiar automaticamente. Selecione o texto da resposta.");
    }
  }

  function apply(item: ChatItem) {
    // Do not apply synthetic mock output as if it were a validated AI suggestion.
    if (!onApplySuggestion || item.answer?.refused || item.answer?.provider === "mock") return;
    const preferred =
      item.intent === "galeria" ? "gallery" : item.intent === "alt" ? "alts" : "hero";
    const parsed = parseRiachinhoSuggestion(item.content, preferred);
    if (!parsed) {
      setError("Não encontrei campos Título/Destaque/Descrição/Alt na resposta. Copie o texto e cole nos campos.");
      return;
    }
    onApplySuggestion(parsed);
  }

  return (
    <div className={s.panel}>
      <div className={s.intro}>
        <span className={s.icon} aria-hidden="true">
          ✦
        </span>
        <div>
          <h2>Riachinho — Assistente editorial</h2>
          <p>
            Ajuda opcional para redação pública e comunicação da igreja. A decisão final e a
            publicação continuam com pessoas autorizadas.
          </p>
        </div>
      </div>

      <div className={s.status} aria-live="polite">
        <span className={statusError ? s.offline : realAi ? s.live : s.mock}>
          {statusError ? "Offline / API indisponível" : realAi ? "IA disponível" : "Modo de simulação"}
        </span>
        <span>
          {status
            ? status.provider === "manus"
              ? "Manus"
              : status.provider === "gemini"
                ? "Gemini"
                : "Provedor real não configurado"
            : statusError
              ? "Sem conexão com /vivi/status"
              : "Consultando o backend…"}
        </span>
      </div>

      {!statusError && status && !realAi && (
        <p className={s.warning}>
          O Riachinho está conectado à API, mas ainda utiliza um provedor simulado neste ambiente.
          Para sugestões reais, um administrador deve configurar <code>GEMINI_API_KEY</code> ou{" "}
          <code>MANUS_API_KEY</code> + <code>MANUS_FORGE_URL</code> no servidor (Vercel HML). Não
          coloque chaves no navegador. Respostas simuladas não podem ser aplicadas aos campos do site.
        </p>
      )}

      <ul className={s.scopes} aria-label="Escopos de edição">
        <li>Redação pública</li>
        <li>Comunicação da igreja</li>
        <li>Títulos e destaques</li>
        <li>Textos alt (sem vision)</li>
      </ul>

      <div className={s.quick} role="group" aria-label="Ações rápidas">
        {QUICK.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={intent === item.id}
            disabled={!canSend}
            onClick={() => {
              setIntent(item.id);
              void ask(item.id);
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className={s.chat} ref={chatRef} id={listId} role="log" aria-live="polite" aria-relevant="additions">
        {messages.map((item) => (
          <div
            key={item.id}
            className={item.role === "user" ? s.bubbleUser : s.bubbleAssistant}
          >
            {item.role === "assistant" && item.answer && (
              <div className={s.bubbleMeta}>
                <strong>{item.answer.refused ? "Solicitação não permitida" : "Sugestão do Riachinho"}</strong>
                <span>
                  {item.answer.provider} · {item.answer.model}
                </span>
              </div>
            )}
            {item.content}
            {item.role === "assistant" && item.id !== "greeting" && !item.answer?.refused && (
              <div className={s.bubbleActions}>
                <button type="button" onClick={() => void copy(item)}>
                  {copiedId === item.id ? "Copiado ✓" : "Copiar"}
                </button>
                <button type="button" disabled={!onApplySuggestion || item.answer?.provider === "mock"} title={item.answer?.provider === "mock" ? "Respostas simuladas não podem alterar o rascunho" : undefined} onClick={() => apply(item)}>
                  Usar sugestão
                </button>
              </div>
            )}
          </div>
        ))}
        {busy && <div className={s.bubbleAssistant}>Riachinho está pensando…</div>}
      </div>

      <div className={s.composer}>
        <label className={s.consent}>
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          <span>
            Confirmo que os textos são públicos, não contêm dados pessoais ou pastorais e aceito
            enviá-los ao provedor de IA.
          </span>
        </label>
        <textarea
          aria-label="Pergunta ou sugestão editorial para o Riachinho"
          value={draft}
          maxLength={1800}
          placeholder="Pergunte ao Riachinho ou peça um ajuste específico…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && draft.trim()) {
              e.preventDefault();
              const text = draft.trim();
              setIntent("livre");
              void ask("livre", text);
            }
          }}
        />
        <div className={s.row}>
          <button
            className={s.send}
            type="button"
            disabled={!canSend || !draft.trim()}
            onClick={() => {
              const text = draft.trim();
              setIntent("livre");
              void ask("livre", text);
            }}
          >
            {busy ? "Consultando o Riachinho…" : "Enviar"}
          </button>
          <span className={s.privacy}>Ctrl+Enter envia · nada é publicado automaticamente</span>
        </div>
      </div>

      {error && (
        <p className={s.error} role="alert">
          {error}
        </p>
      )}

      <p className={s.privacy}>
        {status?.lgpdNotice ??
          "O Riachinho processa apenas textos públicos que você autorizar. Não envie dados de membros ou documentos."}
      </p>
    </div>
  );
}
