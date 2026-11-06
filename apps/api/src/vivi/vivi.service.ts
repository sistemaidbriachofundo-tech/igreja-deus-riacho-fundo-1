import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Optional,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { AuthUser } from "../auth/types/auth-user";
import { PrismaService } from "../prisma/prisma.service";
import { PilotService } from "../pilot/pilot.service";
import {
  detectSensitiveUserIntent,
  VIVI_SENSITIVE_REFUSAL,
  VIVI_SYSTEM_PROMPT,
} from "./system-prompt";
import {
  createViviProvider,
  describeViviProviderConfig,
} from "./providers/providers.factory";
import type {
  ViviChatMessage,
  ViviLlmProvider,
} from "./providers/vivi-provider";
import { ViviRateLimitService } from "./vivi-rate-limit.service";

const MAX_MESSAGES = 20;
const MAX_CONTENT_CHARS = 2000;
const MAX_TOTAL_CHARS = 8000;

export type ViviChatRequest = {
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  /** Obrigatório no endpoint público (LGPD / free-tier Google). */
  consentAiProcessing?: boolean;
  sessionId?: string | null;
};

export type ViviChatResponse = {
  reply: string;
  provider: "manus" | "gemini" | "mock";
  model: string;
  refused: boolean;
  lgpdNotice: string;
  usage: {
    inputChars: number;
    outputChars: number;
    messageCount: number;
    latencyMs: number;
  };
};

function asJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

@Injectable()
export class ViviService {
  private readonly provider: ViviLlmProvider;

  constructor(
    private readonly prisma: PrismaService,
    private readonly pilot: PilotService,
    private readonly rateLimit: ViviRateLimitService,
    @Optional() provider?: ViviLlmProvider,
  ) {
    this.provider = provider ?? createViviProvider();
  }

  getStatus() {
    const cfg = describeViviProviderConfig();
    return {
      assistant: "vivi",
      provider: cfg.mode,
      model: cfg.model,
      manusUrlConfigured: cfg.manusUrlConfigured,
      geminiKeyConfigured: cfg.geminiKeyConfigured,
      publicRate: this.rateLimit.snapshot("public", "_status"),
      adminRate: this.rateLimit.snapshot("admin", "_status"),
      lgpdNotice: this.lgpdNotice(),
      notes: [
        "Chaves Manus/Gemini só no backend — nunca no FE/Git",
        "Free tier Google Gemini pode treinar com prompts — evite PII",
        "GEMINI_MODEL default: gemini-2.5-flash-lite (ver nota de depreciação no handoff)",
      ],
    };
  }

  async chatPublic(
    body: ViviChatRequest,
    clientKey: string,
  ): Promise<ViviChatResponse> {
    if (body.consentAiProcessing !== true) {
      throw new BadRequestException({
        statusCode: 400,
        message:
          "Consentimento obrigatório: consentAiProcessing=true (LGPD / processamento por IA)",
        code: "VIVI_CONSENT_REQUIRED",
      });
    }

    if (!this.rateLimit.tryConsume("public", clientKey)) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: "Limite de mensagens da Vivi atingido — aguarde um minuto",
          code: "VIVI_RATE_LIMITED",
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return this.runChat({
      body,
      actorUserId: null,
      scope: "public",
      clientKey,
    });
  }

  async chatAdmin(
    actor: AuthUser,
    body: ViviChatRequest,
  ): Promise<ViviChatResponse> {
    const key = actor.userId || actor.email || "admin";
    if (!this.rateLimit.tryConsume("admin", key)) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: "Limite admin da Vivi atingido — aguarde",
          code: "VIVI_RATE_LIMITED",
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return this.runChat({
      body,
      actorUserId: actor.userId,
      scope: "admin",
      clientKey: key,
      churchId: actor.churchId ?? null,
      organizationId: actor.organizationId ?? null,
    });
  }

  private async runChat(args: {
    body: ViviChatRequest;
    actorUserId: string | null;
    scope: "public" | "admin";
    clientKey: string;
    churchId?: string | null;
    organizationId?: string | null;
  }): Promise<ViviChatResponse> {
    const messages = this.normalizeMessages(args.body.messages);
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const refused = lastUser
      ? detectSensitiveUserIntent(lastUser.content)
      : false;

    const started = Date.now();
    let reply: string;
    let providerName = this.provider.name;
    let model = this.provider.model;

    if (refused) {
      reply = VIVI_SENSITIVE_REFUSAL;
    } else {
      const result = await this.provider.chat({
        messages: [
          { role: "system", content: args.scope === "admin"
            ? VIVI_SYSTEM_PROMPT + "\nAlém de orientar visitantes, você pode auxiliar a equipe autorizada a REVISAR TEXTO PÚBLICO para o site. Sugira títulos e descrições com linguagem simples, sem inventar fatos, testemunhos, horários ou nomes. Nenhuma sugestão pode publicar conteúdo ou executar ações no sistema."
            : VIVI_SYSTEM_PROMPT },
          ...messages,
        ],
        maxOutputTokens: 1024,
      });
      reply = result.content;
      providerName = result.provider;
      model = result.model;
    }

    const latencyMs = Date.now() - started;
    const inputChars = messages.reduce((n, m) => n + m.content.length, 0);
    const usage = {
      inputChars,
      outputChars: reply.length,
      messageCount: messages.length,
      latencyMs,
    };

    await this.auditUsage({
      actorUserId: args.actorUserId,
      scope: args.scope,
      provider: providerName,
      model,
      refused,
      usage,
      sessionId: args.body.sessionId ?? null,
      churchId: args.churchId,
      organizationId: args.organizationId,
    });

    return {
      reply,
      provider: providerName,
      model,
      refused,
      lgpdNotice: this.lgpdNotice(),
      usage,
    };
  }

  private normalizeMessages(
    raw: ViviChatRequest["messages"] | undefined,
  ): ViviChatMessage[] {
    if (!Array.isArray(raw) || raw.length === 0) {
      throw new BadRequestException({
        statusCode: 400,
        message: "messages[] obrigatório (ao menos 1 mensagem user)",
        code: "VIVI_MESSAGES_REQUIRED",
      });
    }
    if (raw.length > MAX_MESSAGES) {
      throw new BadRequestException({
        statusCode: 400,
        message: `Máximo de ${MAX_MESSAGES} mensagens por request`,
        code: "VIVI_MESSAGES_TOO_MANY",
      });
    }

    const out: ViviChatMessage[] = [];
    let total = 0;
    for (const item of raw) {
      if (!item || typeof item.content !== "string") {
        throw new BadRequestException({
          statusCode: 400,
          message: "Cada mensagem precisa de content string",
          code: "VIVI_MESSAGE_INVALID",
        });
      }
      const role = item.role;
      if (role !== "user" && role !== "assistant" && role !== "system") {
        throw new BadRequestException({
          statusCode: 400,
          message: "role deve ser user|assistant|system",
          code: "VIVI_ROLE_INVALID",
        });
      }
      // Visitante não injeta system próprio — só user/assistant
      if (role === "system") continue;

      const content = item.content.trim().slice(0, MAX_CONTENT_CHARS);
      if (!content) continue;
      total += content.length;
      if (total > MAX_TOTAL_CHARS) {
        throw new BadRequestException({
          statusCode: 400,
          message: "Conversa excedeu o tamanho máximo permitido",
          code: "VIVI_PAYLOAD_TOO_LARGE",
        });
      }
      out.push({ role, content });
    }

    if (!out.some((m) => m.role === "user")) {
      throw new BadRequestException({
        statusCode: 400,
        message: "É necessário ao menos uma mensagem com role=user",
        code: "VIVI_USER_MESSAGE_REQUIRED",
      });
    }

    return out;
  }

  private lgpdNotice(): string {
    return (
      "Avisos LGPD: não envie dados pessoais de terceiros. " +
      "O provedor pode processar o texto fora do Brasil; " +
      "o free tier do Google Gemini pode usar prompts para treino. " +
      "Prefira Manus Forge (VIVI_PROVIDER=manus) quando disponível."
    );
  }

  /**
   * Auditoria opcional de uso — contagem/metadados, SEM prompt completo.
   * Desliga com VIVI_AUDIT=0|false|off.
   */
  private async auditUsage(args: {
    actorUserId: string | null;
    scope: "public" | "admin";
    provider: string;
    model: string;
    refused: boolean;
    usage: ViviChatResponse["usage"];
    sessionId: string | null;
    churchId?: string | null;
    organizationId?: string | null;
  }): Promise<void> {
    const flag = (process.env.VIVI_AUDIT ?? "1").trim().toLowerCase();
    if (flag === "0" || flag === "false" || flag === "off") return;

    try {
      const pilot = await this.pilot.getPilotChurch();
      await this.prisma.auditLog.create({
        data: {
          actorUserId: args.actorUserId,
          action: `vivi.chat.${args.scope}`,
          resourceType: "vivi_chat",
          resourceId: args.sessionId,
          organizationId: args.organizationId ?? pilot.organizationId,
          churchId: args.churchId ?? pilot.churchId,
          metadata: asJson({
            provider: args.provider,
            model: args.model,
            refused: args.refused,
            inputChars: args.usage.inputChars,
            outputChars: args.usage.outputChars,
            messageCount: args.usage.messageCount,
            latencyMs: args.usage.latencyMs,
            // deliberadamente sem prompt/reply
          }),
        },
      });
    } catch {
      // Auditoria não deve derrubar o chat
    }
  }
}
