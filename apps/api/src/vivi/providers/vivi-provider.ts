export type ViviChatRole = "system" | "user" | "assistant";

export type ViviChatMessage = {
  role: ViviChatRole;
  content: string;
};

export type ViviChatInput = {
  messages: ViviChatMessage[];
  /** Máximo de tokens de saída (hint; providers podem ignorar). */
  maxOutputTokens?: number;
};

export type ViviChatResult = {
  content: string;
  provider: "manus" | "gemini" | "mock";
  model: string;
  raw?: Record<string, unknown>;
};

export interface ViviLlmProvider {
  readonly name: "manus" | "gemini" | "mock";
  readonly model: string;
  chat(input: ViviChatInput): Promise<ViviChatResult>;
}
