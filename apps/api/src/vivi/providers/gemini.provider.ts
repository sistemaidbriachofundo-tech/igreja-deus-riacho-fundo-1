import {
  BadGatewayException,
  ServiceUnavailableException,
} from "@nestjs/common";
import type {
  ViviChatInput,
  ViviChatMessage,
  ViviChatResult,
  ViviLlmProvider,
} from "./vivi-provider";

/**
 * Default atual (2026-11): Flash-Lite — mais barato / disponível no AI Studio.
 *
 * Nota de depreciação / sucessores:
 * - `gemini-2.5-flash` e `gemini-2.0-flash` podem ser descontinuados pela Google;
 *   preferir `gemini-2.5-flash-lite` ou o sucessor listado em
 *   https://ai.google.dev/gemini-api/docs/models
 * - Override via `GEMINI_MODEL` sem hardcode exclusivo de um id.
 */
export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-lite";

export type GeminiProviderConfig = {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
};

type GeminiPart = { text?: string };
type GeminiContent = { role?: string; parts?: GeminiPart[] };

/**
 * Google AI Studio (Generative Language API) via REST — chave só no backend.
 * Nunca expor `GEMINI_API_KEY` no FE ou Git.
 */
export class GeminiViviProvider implements ViviLlmProvider {
  readonly name = "gemini" as const;
  readonly model: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: GeminiProviderConfig) {
    this.apiKey = config.apiKey;
    this.model = (config.model?.trim() || DEFAULT_GEMINI_MODEL).trim();
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async chat(input: ViviChatInput): Promise<ViviChatResult> {
    const { systemInstruction, contents } = this.toGeminiPayload(
      input.messages,
    );

    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/` +
      `${encodeURIComponent(this.model)}:generateContent` +
      `?key=${encodeURIComponent(this.apiKey)}`;

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction,
          contents,
          generationConfig: {
            maxOutputTokens: input.maxOutputTokens ?? 1024,
            temperature: 0.4,
          },
        }),
      });
    } catch (err) {
      throw new ServiceUnavailableException({
        statusCode: 503,
        message: "Google Gemini indisponível",
        code: "VIVI_GEMINI_UNAVAILABLE",
        detail: err instanceof Error ? err.message : "network_error",
      });
    }

    const body = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;

    if (!response.ok) {
      throw new BadGatewayException({
        statusCode: 502,
        message: "Gemini rejeitou a solicitação",
        code: "VIVI_GEMINI_ERROR",
        detail: body.error ?? body,
      });
    }

    const candidates = body.candidates as
      | Array<{ content?: GeminiContent }>
      | undefined;
    const parts = candidates?.[0]?.content?.parts ?? [];
    const content = parts
      .map((p) => p.text ?? "")
      .join("")
      .trim();

    if (!content) {
      throw new BadGatewayException({
        statusCode: 502,
        message: "Resposta Gemini vazia ou bloqueada",
        code: "VIVI_GEMINI_EMPTY",
        detail: body.promptFeedback ?? null,
      });
    }

    return {
      content,
      provider: "gemini",
      model: this.model,
      raw: {
        usageMetadata: body.usageMetadata,
        finishReason: candidates?.[0]
          ? (candidates[0] as { finishReason?: string }).finishReason
          : undefined,
      },
    };
  }

  private toGeminiPayload(messages: ViviChatMessage[]): {
    systemInstruction: { parts: Array<{ text: string }> };
    contents: GeminiContent[];
  } {
    const systemParts: string[] = [];
    const contents: GeminiContent[] = [];

    for (const msg of messages) {
      if (msg.role === "system") {
        systemParts.push(msg.content);
        continue;
      }
      contents.push({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }],
      });
    }

    return {
      systemInstruction: {
        parts: [{ text: systemParts.join("\n\n") || "Você é a Vivi." }],
      },
      contents,
    };
  }
}
