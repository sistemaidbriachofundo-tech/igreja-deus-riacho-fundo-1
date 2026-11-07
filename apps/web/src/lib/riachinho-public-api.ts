import type { ViviChatMessageDto, ViviChatRequest, ViviChatResponse, ViviStatusResponse } from "@idbrf/shared";
import { publicApiBase } from "./portal-live-data";

type PublicChatMessage = Pick<ViviChatMessageDto, "role" | "content">;

/** Public chat is opt-in in the HML build, never enabled implicitly on GitHub Pages. */
export function riachinhoPublicEnabled(
  flag: string | undefined = process.env.NEXT_PUBLIC_RIACHINHO_PUBLIC_ENABLED,
  apiUrl: string | undefined = process.env.NEXT_PUBLIC_API_URL,
): boolean {
  const base = publicApiBase(apiUrl);
  if (flag !== "true" || !base) return false;
  return process.env.NODE_ENV === "development" || base.startsWith("https://");
}

export function parseRiachinhoStatus(value: unknown): ViviStatusResponse | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const data = value as Partial<ViviStatusResponse>;
  if (data.assistant !== "vivi" || data.displayName !== "Riachinho") return null;
  if (!["manus", "gemini", "mock"].includes(String(data.provider))) return null;
  if (typeof data.model !== "string" || !data.model.trim()) return null;
  if (typeof data.lgpdNotice !== "string" || !data.lgpdNotice.trim()) return null;
  return data as ViviStatusResponse;
}

export function riachinhoProviderReady(status: ViviStatusResponse | null): boolean {
  if (!status) return false;
  return (status.provider === "gemini" && status.geminiKeyConfigured === true) ||
    (status.provider === "manus" && status.manusUrlConfigured === true && status.manusKeyConfigured === true);
}

export function parseRiachinhoAnswer(value: unknown): ViviChatResponse | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const data = value as Partial<ViviChatResponse>;
  if (typeof data.reply !== "string" || !data.reply.trim() || data.reply.length > 12000) return null;
  if (!["manus","gemini","mock"].includes(String(data.provider))) return null;
  if (typeof data.model !== "string" || typeof data.refused !== "boolean") return null;
  if (typeof data.lgpdNotice !== "string") return null;
  return data as ViviChatResponse;
}

export function prepareRiachinhoPublicRequest(
  history: PublicChatMessage[],
  prompt: string,
  sessionId: string,
  consent: boolean,
): ViviChatRequest {
  if (!consent) throw new Error("Confirme o consentimento antes de enviar.");
  const text = prompt.trim();
  if (!text || text.length > 1800) throw new Error("Escreva uma pergunta com até 1.800 caracteres.");
  if (!sessionId.trim() || sessionId.length > 128) throw new Error("Sessão inválida.");

  // The public API limits a message to 2,000 chars and the total request to 8,000.
  const recent: ViviChatMessageDto[] = history.filter((m) =>
    (m.role === "user" || m.role === "assistant") && typeof m.content === "string",
  ).slice(-8).map((m) => ({ role:m.role, content:m.content.trim().slice(0,1800) }));
  const messages: ViviChatMessageDto[] = [
    ...recent.filter((m) => m.content.length > 0),
    { role: "user", content: text },
  ];
  while (messages.length > 1 &&
    (messages.reduce((sum, m) => sum + m.content.length, 0) > 7200 || messages.length > 10)) {
    messages.shift();
  }
  return { messages, sessionId, consentAiProcessing: true };
}

export function riachinhoPublicError(status: number, body: unknown): string {
  const data = body && typeof body === "object" && !Array.isArray(body)
    ? body as Record<string, unknown>
    : {};
  if (status === 429 || data.code === "VIVI_RATE_LIMITED")
    return "Muitas mensagens neste momento. Aguarde um minuto antes de tentar novamente.";
  if (status === 400 && data.code === "VIVI_CONSENT_REQUIRED")
    return "É necessário autorizar o processamento do texto antes de enviar.";
  if (status === 502 || status === 503 || status === 504)
    return "O Riachinho está temporariamente indisponível. Tente novamente ou consulte os canais oficiais da igreja.";
  if (status === 400) return "Não foi possível processar esta mensagem. Revise o texto e tente novamente.";
  return "Não foi possível consultar o Riachinho agora. Sua pergunta continua disponível para tentar novamente.";
}
