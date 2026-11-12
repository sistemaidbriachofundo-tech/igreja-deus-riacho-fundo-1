import { BadRequestException, ConflictException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { hashPassword } from "./auth.service";
import { assertPasswordPolicy } from "./password-policy";

const INVITE_TTL_HOURS = 24;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export function inviteTokenHash(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function inviteEmailConfig() {
  const key = process.env.ACCESS_INVITE_RESEND_API_KEY?.trim();
  const from = process.env.ACCESS_INVITE_FROM_EMAIL?.trim();
  const base = process.env.ACCESS_INVITE_WEB_ORIGIN?.trim();
  if (!key || !from || !base) {
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
  return { key, from, origin: origin.origin };
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
  constructor(private readonly prisma: PrismaService) {}

  newToken() {
    const token = randomBytes(32).toString("base64url");
    return {
      token,
      tokenHash: inviteTokenHash(token),
      expiresAt: new Date(Date.now() + INVITE_TTL_HOURS * 3600_000),
    };
  }

  async deliver(input: { inviteId: string; token: string; email: string; name: string }) {
    const config = inviteEmailConfig();
    const link = new URL("/ativar-acesso/", config.origin);
    link.searchParams.set("token", input.token);
    const title = "Ative seu acesso ao Sistema Riacho 1";
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
          text: `Olá, ${firstName}!\n\nFoi criado um acesso para você no Sistema Igreja de Deus — Riacho Fundo I.\n\nDefina a sua senha pelo link abaixo, válido por 24 horas e de uso único:\n${link.toString()}\n\nSe não reconhece o convite, ignore esta mensagem.\n\nEquipe de Secretaria — Riacho Fundo I`,
          html: `<div style="font-family:Arial,sans-serif;color:#214a38;max-width:550px;margin:auto;padding:25px"><h1 style="color:#1e573f">Bem-vindo ao Sistema Riacho 1</h1><p>Olá, ${escapeHtml(firstName)}!</p><p>Foi criado um acesso para você na Igreja de Deus — Riacho Fundo I.</p><p><a href="${escapeHtml(link.toString())}" style="display:inline-block;background:#205c43;color:white;padding:14px 22px;border-radius:10px;text-decoration:none;font-weight:bold">Definir minha senha</a></p><p>Este link vale por 24 horas e pode ser utilizado apenas uma vez. Se você não solicitou este acesso, ignore esta mensagem.</p></div>`,
        }),
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw new ServiceUnavailableException("Não foi possível conectar ao serviço de e-mail. Conta não ativada; reenvie o convite.");
    }
    if (!response.ok) {
      throw new ServiceUnavailableException("O serviço de e-mail recusou o convite. Conta não ativada; verifique o remetente e reenvie.");
    }
    await this.prisma.accessInvitation.update({
      where: { id: input.inviteId }, data: { sentAt: new Date() },
    });
    return { sent: true, email: input.email, expiresInHours: INVITE_TTL_HOURS };
  }

  async accept(input: { token: string; password: string }) {
    if (!TOKEN_RE.test(input.token ?? "")) {
      throw new BadRequestException("Link inválido ou expirado. Solicite um novo convite.");
    }
    const now = new Date();
    const row = await this.prisma.accessInvitation.findUnique({
      where: { tokenHash: inviteTokenHash(input.token) },
      include: { user: true },
    });
    if (!row || row.consumedAt || row.revokedAt || row.expiresAt <= now
      || !row.sentAt || row.user.status !== "DISABLED" || row.user.passwordHash) {
      throw new BadRequestException("Link inválido ou expirado. Solicite um novo convite.");
    }
    assertPasswordPolicy(input.password, row.email);
    const passwordHash = await hashPassword(input.password);
    await this.prisma.$transaction(async tx => {
      const consumed = await tx.accessInvitation.updateMany({
        where: { id: row.id, consumedAt: null, revokedAt: null, expiresAt: { gt: new Date() }, sentAt: { not: null } },
        data: { consumedAt: new Date() },
      });
      if (consumed.count !== 1) throw new ConflictException("Este convite já foi utilizado. Solicite outro.");
      const user = await tx.user.updateMany({
        where: { id: row.userId, status: "DISABLED", passwordHash: null, email: row.email },
        data: { passwordHash, status: "ACTIVE", authzVersion: { increment: 1 } },
      });
      if (user.count !== 1) throw new ConflictException("Este acesso foi alterado. Solicite outro convite.");
      await tx.accessInvitation.updateMany({
        where: { userId: row.userId, id: { not: row.id }, consumedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.auditLog.create({ data: {
        actorUserId: row.userId, action: "access.activate",
        resourceType: "user", resourceId: row.userId,
        metadata: { via: "one_time_invitation", expiresAt: row.expiresAt.toISOString() },
      } });
    }, { isolationLevel: "Serializable" });
    return { activated: true, message: "Senha definida. Faça seu login para continuar." };
  }
}
