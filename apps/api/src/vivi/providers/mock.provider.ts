import type {
  ViviChatInput,
  ViviChatResult,
  ViviLlmProvider,
} from "./vivi-provider";

/**
 * Provider local para testes / DEV sem chave.
 * Resposta sintética institucional — não chama rede.
 */
export class MockViviProvider implements ViviLlmProvider {
  readonly name = "mock" as const;
  readonly model: string;

  constructor(model = "mock-vivi-idbrf") {
    this.model = model;
  }

  async chat(input: ViviChatInput): Promise<ViviChatResult> {
    const lastUser = [...input.messages]
      .reverse()
      .find((m) => m.role === "user");
    const snippet = (lastUser?.content ?? "").trim().slice(0, 80);
    const content = [
      "Olá! Eu sou o Riachinho, assistente institucional da Igreja de Deus no Riacho Fundo I.",
      "Posso ajudar com horários públicos, ministérios do portal e textos editoriais do site.",
      "Não acesso dados de membros, casos pastorais nem informações pessoais.",
      snippet
        ? `Recebi sua mensagem (demo): «${snippet}${snippet.length >= 80 ? "…" : ""}».`
        : "Envie uma pergunta sobre a igreja para começarmos.",
      "(Resposta mock — configure MANUS_FORGE_URL ou GEMINI_API_KEY para IA real.)",
    ].join(" ");

    return {
      content,
      provider: "mock",
      model: this.model,
      raw: { mock: true, messageCount: input.messages.length },
    };
  }
}
