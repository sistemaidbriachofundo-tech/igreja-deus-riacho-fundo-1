import { ServiceUnavailableException } from "@nestjs/common";

export interface PublicSmtpConfig {
  host: string;
  port: 465 | 587;
  user: string;
  from: string;
}

const HOST = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
const FROM = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Lê a forma da configuração SMTP sem devolver a senha.
 * Hostinger no ambiente autorizado: smtp.hostinger.com, porta 587 (STARTTLS) ou 465 (TLS).
 */
export function readPublicSmtpConfig(env: NodeJS.ProcessEnv = process.env): PublicSmtpConfig {
  const host = env.SMTP_HOST?.trim() ?? "";
  const port = Number(env.SMTP_PORT?.trim() || "587");
  const user = env.SMTP_USER?.trim() ?? "";
  const from = env.SMTP_FROM?.trim() ?? "";
  const password = env.SMTP_PASSWORD ?? "";
  if (!HOST.test(host) || (port !== 465 && port !== 587) || !user || user.length > 200 || !FROM.test(from)) {
    throw new ServiceUnavailableException(
      "SMTP incompleto. Preencha host, porta 587 ou 465, usuário e remetente no ambiente autorizado.",
    );
  }
  if (!password.trim()) {
    throw new ServiceUnavailableException(
      "SMTP_PASSWORD ausente. A senha fica só no ambiente autorizado e não entra no código.",
    );
  }
  return { host, port, user, from };
}

export function smtpSendEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.SMTP_SEND_ENABLED === "1";
}
