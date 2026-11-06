import type {
  ViviChatInput,
  ViviChatResult,
  ViviLlmProvider,
} from "./vivi-provider";
import {
  postJsonForProvider,
  requireNonEmptyText,
  stripTrailingSlashes,
} from "./http-json";

export type ManusProviderConfig = {
  /** Base URL do gateway Manus Forge (ex.: https://forge.manus.im). */
  baseUrl: string;
  apiKey: string;
  /**
   * Modelo hint. Forge costuma rotear sozinho; default `auto`.
   * Path: POST {baseUrl}/v1/chat/completions (OpenAI-compatible).
   */
  model?: string;
  fetchImpl?: typeof fetch;
};

/**
 * Adapter Manus Forge — OpenAI-compatible chat completions.
 *
 * Env alinhados (ver `.env.example`):
 * - `MANUS_FORGE_URL` (alias `BUILT_IN_FORGE_API_URL`)
 * - `MANUS_API_KEY` (alias `BUILT_IN_FORGE_API_KEY`)
 *
 * Contrato oficial Manus Forge `invokeLLM` não é público estável fora da
 * plataforma; usamos a superfície compatível `/v1/chat/completions`.
 */
export class ManusViviProvider implements ViviLlmProvider {
  readonly name = "manus" as const;
  readonly model: string;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: ManusProviderConfig) {
    this.baseUrl = stripTrailingSlashes(config.baseUrl);
    this.apiKey = config.apiKey;
    this.model = config.model?.trim() || "auto";
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async chat(input: ViviChatInput): Promise<ViviChatResult> {
    const url = this.baseUrl.endsWith("/v1")
      ? `${this.baseUrl}/chat/completions`
      : `${this.baseUrl}/v1/chat/completions`;

    const body = await postJsonForProvider(
      this.fetchImpl,
      url,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: {
          model: this.model,
          messages: input.messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          max_tokens: input.maxOutputTokens ?? 1024,
        },
      },
      {
        unavailableMessage: "Gateway Manus Forge indisponível",
        unavailableCode: "VIVI_MANUS_UNAVAILABLE",
        rejectMessage: "Manus Forge rejeitou a solicitação",
        rejectCode: "VIVI_MANUS_ERROR",
        rejectDetail: (b) =>
          typeof b.error === "object" ? b.error : b,
      },
    );

    const choices = body.choices as
      | Array<{ message?: { content?: string } }>
      | undefined;
    const content = requireNonEmptyText(
      choices?.[0]?.message?.content,
      "Resposta Manus vazia ou inválida",
      "VIVI_MANUS_EMPTY",
    );

    const usedModel =
      typeof body.model === "string" && body.model.trim()
        ? body.model
        : this.model;

    return {
      content,
      provider: "manus",
      model: usedModel,
      raw: { id: body.id, usage: body.usage },
    };
  }
}
