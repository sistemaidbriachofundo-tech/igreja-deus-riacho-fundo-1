import { BadRequestException, ConflictException, Injectable, Optional, ServiceUnavailableException } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { effectiveSettingValue } from "@idbrf/shared";
import { MailService } from "../mail/mail.service";
import { readPublicSmtpConfig, smtpSendEnabled } from "../mail/smtp-config";
import { clampPasswordResetHours } from "../piloto/system-settings.service";
import { PrismaService } from "../prisma/prisma.service";
import { hashPassword } from "./auth.service";
import { assertPasswordPolicy } from "./password-policy";

const INVITE_TTL_HOURS = 24;
const RESET_TTL_HOURS = 1;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export function inviteTokenHash(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function inviteEmailConfig() {
  const stage = process.env.IDBRF_RUNTIME_STAGE;
  const transport = (process.env.EMAIL_TRANSPORT ?? "").trim().toLowerCase();
  const preview = transport !== "test" && transport !== "smtp"
    && (stage === "qa" || stage === "hml")
    && process.env.ACCESS_INVITE_DELIVERY === "preview";
  const key = process.env.ACCESS_INVITE_RESEND_API_KEY?.trim();
  const from = process.env.ACCESS_INVITE_FROM_EMAIL?.trim()
    || (transport === "test" ? "nao-responda@example.test" : undefined);
  const base = process.env.ACCESS_INVITE_WEB_ORIGIN?.trim()
    || (transport === "test" ? "https://dev.example.test" : undefined);
  if (transport === "smtp") {
    readPublicSmtpConfig(process.env);
    if (!smtpSendEnabled(process.env)) throw new ServiceUnavailableException("O envio SMTP de convites está desativado.");
  }
  if (!base || (!preview && transport !== "test" && transport !== "smtp" && (!key || !from))) {
    throw new ServiceUnavailableException(
      "O envio de convites ainda não está configurado. Nenhuma conta será criada sem o e-mail de ativação.",
    );
  }
  let origin: URL;
  try { origin = new URL(base); } catch { throw new ServiceUnavailableException("Origem do link de ativação inválida."); }
  if (origin.protocol !== "https:" || !origin.hostname || origin.username || origin.password || origin.search || origin.hash
    || origin.pathname !== "/") {
    throw new ServiceUnavailableException("A URL de ativação deve ser uma origem HTTPS sem caminhos ou parâmetros.");
  }
  const basePath = process.env.ACCESS_INVITE_WEB_BASE_PATH?.trim() || "";
  if (basePath && !/^(?:\/[a-zA-Z0-9_-]+)+$/.test(basePath)) {
    throw new ServiceUnavailableException("Caminho base do portal de acesso inválido.");
  }
  return {
    key,
    from,
    origin: origin.origin,
    basePath,
    preview,
    transport: transport === "test" || transport === "smtp" ? transport : "resend",
  };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, letter => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;",
  })[letter] ?? letter);
}

/**
 * O segredo cru só existe durante a criação e o envio; a tabela guarda apenas SHA-256.
 * Um envio falho não ativa a conta: é possível reenviar pelo painel administrativo.
 */
@Injectable()
export class AccessInvitationService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly mail?: MailService,
  ) {}

  newToken(purpose: "ACTIVATION" | "PASSWORD_RESET" = "ACTIVATION", ttlHours?: number) {
    const token = randomBytes(32).toString("base64url");
    const hours = purpose === "PASSWORD_RESET" ? clampPasswordResetHours(ttlHours ?? RESET_TTL_HOURS) : INVITE_TTL_HOURS;
    return {
      token,
      tokenHash: inviteTokenHash(token),
      expiresAt: new Date(Date.now() + hours * 3600_000),
    };
  }

  async issueToken(purpose: "ACTIVATION" | "PASSWORD_RESET" = "ACTIVATION") {
    const hours = purpose === "PASSWORD_RESET" ? await this.passwordResetTtlHours() : undefined;
    return this.newToken(purpose, hours);
  }

  private async passwordResetTtlHours() {
    const catalog = (this.prisma as {
      systemSettingCatalog?: { findUnique: (args: unknown) => Promise<{ key: string; devJson: unknown } | null> };
      systemSettingRevision?: { findMany: (args: unknown) => Promise<Array<{ effectiveFrom: Date | null; effectiveUntil: Date | null; valueJson: unknown; id: string }>> };
    }).systemSettingCatalog;
    if (!catalog?.findUnique) return RESET_TTL_HOURS;
    try {
      const row = await catalog.findUnique({ where: { key: "auth.password_reset.ttl_hours" } });
      if (!row) return RESET_TTL_HOURS;
      const revisions = await this.prisma.systemSettingRevision?.findMany?.({
        where: { catalogKey: row.key, lifecycle: "PUBLISHED" },
      }) ?? [];
      const chosen = effectiveSettingValue({
        devValue: row.devJson,
        at: new Date().toISOString(),
        revisions: revisions.flatMap((revision: { id: string; valueJson: unknown; effectiveFrom: Date | null; effectiveUntil: Date | null }) => revision.effectiveFrom ? [{
          id: revision.id,
          value: revision.valueJson,
          effectiveFrom: revision.effectiveFrom.toISOString(),
          effectiveUntil: revision.effectiveUntil?.toISOString() ?? null,
        }] : []),
      });
      return clampPasswordResetHours(chosen.value);
    } catch {
      return RESET_TTL_HOURS;
    }
  }

  async deliver(input: {
    inviteId: string; token: string; email: string; name: string;
    purpose?: "ACTIVATION" | "PASSWORD_RESET";
    expiresInHours?: number;
  }) {
    const config = inviteEmailConfig();
    const reset = input.purpose === "PASSWORD_RESET";
    const expiresInHours = reset ? clampPasswordResetHours(input.expiresInHours ?? RESET_TTL_HOURS) : INVITE_TTL_HOURS;
    const route = reset ? "/redefinir-senha/" : "/ativar-acesso/";
    const link = new URL(config.basePath + route, config.origin);
    link.hash = new URLSearchParams({ token: input.token }).toString();
    if (config.preview) {
      if (!input.email.endsWith("@example.test")) {
        throw new BadRequestException("A entrega de teste é restrita a contas fictícias.");
      }
      await this.markDelivered(input.inviteId);
      return { sent: false, email: input.email, expiresInHours, previewUrl: link.toString() };
    }
    if (config.transport === "test" || config.transport === "smtp") {
      if (config.transport === "test" && !input.email.endsWith("@example.test")) {
        throw new BadRequestException("A entrega de teste é restrita a contas fictícias.");
      }
      if (!this.mail) {
        throw new ServiceUnavailableException("Transporte de e-mail indisponível.");
      }
      const title = reset ? "Redefina sua senha do Sistema Riacho 1" : "Ative seu acesso ao Sistema Riacho 1";
      const instruction = reset
        ? "Foi solicitada a recuperação de acesso à sua conta."
        : "Foi criado um acesso para você no Sistema Igreja de Deus — Riacho Fundo I.";
      await this.mail.deliverOnce({
        idempotencyKey: `access-invite:${input.inviteId}`,
        to: input.email,
        subject: title,
        text: `Defina a senha pelo link de uso único, válido por ${expiresInHours} h.\n${link.toString()}\n\n${instruction}`,
      });
      await this.markDelivered(input.inviteId);
      return { sent: true, email: input.email, expiresInHours, transport: config.transport };
    }
    const title = reset ? "Redefina sua senha do Sistema Riacho 1" : "Ative seu acesso ao Sistema Riacho 1";
    const instruction = reset
      ? "Foi solicitada a recuperação de acesso à sua conta."
      : "Foi criado um acesso para você no Sistema Igreja de Deus — Riacho Fundo I.";
    const firstName = input.name.trim().split(/\s+/)[0] || "pessoa";
    let response: Response;
    try {
      response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: "Bearer " + config.key, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: config.from,
          to: [input.email],
          subject: title,
          text: `Olá, ${firstName}!\n\n${instruction}\n\nDefina a sua senha pelo link abaixo, válido por ${expiresInHours} h e de uso único:\n${link.toString()}\n\nSe não reconhece a solicitação, ignore esta mensagem.\n\nEquipe de Secretaria — Riacho Fundo I`,
          html: `<div style="font-family:Arial,sans-serif;color:#214a38;max-width:550px;margin:auto;padding:25px"><h1 style="color:#1e573f">Bem-vindo ao Sistema Riacho 1</h1><p>Olá, ${escapeHtml(firstName)}!</p><p>${escapeHtml(instruction)}</p><p><a href="${escapeHtml(link.toString())}" style="display:inline-block;background:#205c43;color:white;padding:14px 22px;border-radius:10px;text-decoration:none;font-weight:bold">Definir minha senha</a></p><p>Este link vale por ${expiresInHours} h e pode ser utilizado apenas uma vez. Se você não solicitou este acesso, ignore esta mensagem.</p></div>`,
        }),
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw new ServiceUnavailableException("Não foi possível conectar ao serviço de e-mail. Conta não ativada; reenvie o convite.");
    }
    if (!response.ok) {
      throw new ServiceUnavailableException("O serviço de e-mail recusou o convite. Conta não ativada; verifique o remetente e reenvie.");
    }
    await this.markDelivered(input.inviteId);
    return { sent: true, email: input.email, expiresInHours };
  }

  private async markDelivered(id: string) {
    await this.prisma.accessInvitation.update({
      where: { id }, data: { sentAt: new Date() },
    });
  }

  async accept(
    input: { token: string; password: string },
    purpose: "ACTIVATION" | "PASSWORD_RESET" = "ACTIVATION",
  ) {
    const reset = purpose === "PASSWORD_RESET";
    if (!TOKEN_RE.test(input.token ?? "")) {
      throw new BadRequestException("Link inválido ou expirado. Solicite um novo link.");
    }
    const now = new Date();
    const row = await this.prisma.accessInvitation.findUnique({
      where: { tokenHash: inviteTokenHash(input.token) },
      include: { user: true },
    });
    if (!row || row.purpose !== purpose || row.consumedAt || row.revokedAt || row.expiresAt <= now
      || !row.sentAt || row.user.email !== row.email
      || (reset ? row.user.status !== "ACTIVE" || !row.user.passwordHash
        : row.user.status !== "DISABLED" || Boolean(row.user.passwordHash))) {
      throw new BadRequestException("Link inválido ou expirado. Solicite um novo link.");
    }
    assertPasswordPolicy(input.password, row.email);
    const passwordHash = await hashPassword(input.password);
    try {
      await this.prisma.$transaction(async tx => {
        const consumed = await tx.accessInvitation.updateMany({
          where: { id: row.id, purpose, consumedAt: null, revokedAt: null, expiresAt: { gt: new Date() }, sentAt: { not: null } },
          data: { consumedAt: new Date() },
        });
        if (consumed.count !== 1) throw new ConflictException("Este convite já foi utilizado. Solicite outro.");
        const user = await tx.user.updateMany({
          where: { id: row.userId, status: reset ? "ACTIVE" : "DISABLED", passwordHash: row.user.passwordHash, email: row.email },
          data: { passwordHash, status: "ACTIVE", authzVersion: { increment: 1 } },
        });
        if (user.count !== 1) throw new ConflictException("Este acesso foi alterado. Solicite outro convite.");
        await tx.accessInvitation.updateMany({
          where: { userId: row.userId, id: { not: row.id }, consumedAt: null, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        if (reset) {
          await tx.authSession.updateMany({
            where: { userId: row.userId, status: "ACTIVE" },
            data: { status: "REVOKED", revokedAt: now, revokeReason: "password_reset" },
          });
          await tx.mfaChallenge.updateMany({
            where: { userId: row.userId, status: "PENDING" },
            data: { status: "REVOKED" },
          });
        }
        await tx.auditLog.create({ data: {
          actorUserId: row.userId, action: reset ? "access.password.reset" : "access.activate",
          resourceType: "user", resourceId: row.userId,
          metadata: { via: "one_time_invitation", expiresAt: row.expiresAt.toISOString() },
        } });
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "P2034") {
        throw new ConflictException("Este link foi alterado ou já utilizado. Solicite outro.");
      }
      throw error;
    }
    return { activated: true, message: "Senha definida. Faça seu login para continuar." };
  }

  /**
   * Pedido público. Não revela se o e-mail existe, se a conta está ativa ou se o envio ocorreu.
   * O link continua de uso único e expira no prazo vigente, entre 1 e 24 horas.
   */
  async requestPublicReset(emailRaw: string): Promise<void> {
    const email = emailRaw.trim().toLowerCase();
    if (!email.includes("@") || email.length > 254) return;
    try {
      const user = await this.prisma.user.findFirst({
        where: { email: { equals: email, mode: "insensitive" }, status: "ACTIVE" },
        select: { id: true, email: true, status: true, passwordHash: true, person: { select: { displayName: true } } },
      });
      if (!user?.passwordHash || user.email !== email) return;
      const config = inviteEmailConfig();
      if ((config.preview || config.transport === "test") && !user.email.endsWith("@example.test")) return;
      const recent = await this.prisma.accessInvitation.findFirst({
        where: { userId: user.id, purpose: "PASSWORD_RESET", revokedAt: null, createdAt: { gte: new Date(Date.now() - 60_000) } },
        select: { id: true },
      });
      if (recent) return;
      const issued = await this.issueToken("PASSWORD_RESET");
      const invite = await this.prisma.accessInvitation.create({
        data: { userId: user.id, purpose: "PASSWORD_RESET", tokenHash: issued.tokenHash, email: user.email, expiresAt: issued.expiresAt },
        select: { id: true },
      });
      await this.deliver({
        inviteId: invite.id, token: issued.token, email: user.email, name: user.person.displayName, purpose: "PASSWORD_RESET",
        expiresInHours: Math.max(1, Math.round((issued.expiresAt.getTime() - Date.now()) / 3600_000)),
      });
      await this.prisma.accessInvitation.updateMany({
        where: { userId: user.id, purpose: "PASSWORD_RESET", id: { not: invite.id }, consumedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.prisma.auditLog.create({
        data: {
          actorUserId: user.id, action: "access.password.reset.request", resourceType: "user", resourceId: user.id,
          metadata: { via: "self_service" },
        },
      });
    } catch {
      // A resposta pública permanece neutra mesmo quando o envio não está disponível.
    }
  }
}
