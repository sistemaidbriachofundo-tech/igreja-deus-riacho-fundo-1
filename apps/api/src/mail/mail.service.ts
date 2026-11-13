import { BadRequestException, Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { readPublicSmtpConfig, smtpSendEnabled } from "./smtp-config";

export interface OutboundMessage {
  idempotencyKey: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: Array<{ filename: string; content: Buffer; cid: string }>;
}

export interface MailTransport {
  readonly name: "test" | "smtp";
  send(message: OutboundMessage): Promise<{ providerMessageId: string }>;
}

export const MAIL_TRANSPORT = Symbol("MAIL_TRANSPORT");

export interface MailReceipt {
  status: "SENT" | "FAILED";
  idempotentReplay: boolean;
  providerMessageId: string | null;
}

@Injectable()
export class TestMailTransport implements MailTransport {
  readonly name = "test" as const;
  readonly sent: OutboundMessage[] = [];

  async send(message: OutboundMessage): Promise<{ providerMessageId: string }> {
    if (process.env.IDBRF_RUNTIME_STAGE === "production") {
      throw new ServiceUnavailableException("O transporte de teste não envia em produção.");
    }
    if (!message.to.endsWith("@example.test")) {
      throw new BadRequestException("A entrega de teste é restrita a contas fictícias.");
    }
    this.sent.push(message);
    return { providerMessageId: `test:${message.idempotencyKey}` };
  }
}

/** Não abre conexão enquanto o envio live não estiver ligado no ambiente autorizado. */
export class SmtpMailTransport implements MailTransport {
  readonly name = "smtp" as const;

  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}

  async send(message: OutboundMessage): Promise<{ providerMessageId: string }> {
    const config = readPublicSmtpConfig(this.env);
    if (!smtpSendEnabled(this.env)) {
      throw new ServiceUnavailableException(
        "O SMTP da igreja está configurado na forma, mas o envio live permanece desligado. Use o transporte de teste neste DEV.",
      );
    }
    const password = this.env.SMTP_PASSWORD ?? "";
    const nodemailer = (await import("nodemailer")) as unknown as {
      createTransport: (options: Record<string, unknown>) => {
        sendMail: (mail: Record<string, unknown>) => Promise<{ messageId?: string }>;
      };
    };
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      requireTLS: config.port === 587,
      auth: { user: config.user, pass: password },
      tls: { minVersion: "TLSv1.2" },
    });
    const info = await transporter.sendMail({
      from: config.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      attachments: message.attachments,
    });
    return { providerMessageId: info.messageId || `smtp:${message.idempotencyKey}` };
  }
}

export function createMailTransport(env: NodeJS.ProcessEnv = process.env): MailTransport {
  const mode = (env.EMAIL_TRANSPORT ?? "test").trim().toLowerCase();
  if (mode === "smtp") return new SmtpMailTransport(env);
  return new TestMailTransport();
}

@Injectable()
export class MailService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(MAIL_TRANSPORT) private readonly transport: MailTransport,
  ) {}

  /**
   * Um mesmo idempotencyKey enviado com sucesso não dispara outro envio.
   * Falha anterior pode ser tentada de novo. O corpo não é persistido.
   */
  async deliverOnce(
    message: OutboundMessage,
    options?: { required?: boolean },
  ): Promise<MailReceipt> {
    const required = options?.required !== false;
    const existing = await this.prisma.mailDelivery.findUnique({
      where: { idempotencyKey: message.idempotencyKey },
    });
    if (existing?.status === "SENT") {
      return {
        status: "SENT",
        idempotentReplay: true,
        providerMessageId: existing.providerMessageId,
      };
    }
    const busy = () => {
      if (!required) return { status: "FAILED" as const, idempotentReplay: false, providerMessageId: null };
      throw new ServiceUnavailableException("Este envio já está em andamento.");
    };
    if (existing?.status === "PENDING") return busy();
    if (existing) {
      const claimed = await this.prisma.mailDelivery.updateMany({
        where: { idempotencyKey: message.idempotencyKey, status: "FAILED" },
        data: { status: "PENDING", attemptCount: { increment: 1 }, lastError: null },
      });
      if (claimed.count !== 1) return busy();
    } else {
      try {
        await this.prisma.mailDelivery.create({
          data: {
            idempotencyKey: message.idempotencyKey,
            toAddress: message.to,
            subject: message.subject.slice(0, 180),
            status: "PENDING",
            attemptCount: 1,
          },
        });
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "P2002") return busy();
        throw error;
      }
    }
    try {
      const sent = await this.transport.send(message);
      await this.prisma.mailDelivery.update({
        where: { idempotencyKey: message.idempotencyKey },
        data: { status: "SENT", sentAt: new Date(), providerMessageId: sent.providerMessageId, lastError: null },
      });
      return { status: "SENT", idempotentReplay: false, providerMessageId: sent.providerMessageId };
    } catch (error) {
      await this.prisma.mailDelivery.update({
        where: { idempotencyKey: message.idempotencyKey },
        data: { status: "FAILED", lastError: safeMailError(error) },
      });
      if (!required) return { status: "FAILED", idempotentReplay: false, providerMessageId: null };
      throw error;
    }
  }
}

function safeMailError(error: unknown): string {
  const message = error instanceof Error ? error.message : "falha de envio";
  if (/token=|bearer |senha|password|smtp_password|secret/i.test(message)) return "falha de envio";
  return message.slice(0, 180);
}
