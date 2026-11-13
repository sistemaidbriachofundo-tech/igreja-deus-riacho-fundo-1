import { BadRequestException, ServiceUnavailableException } from "@nestjs/common";

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

const SINGLE_RECIPIENT = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;

/** Caixas autorizadas a receber o SMTP live. Comparação exata, sem nome de exibição. */
export function smtpAllowedRecipients(env: NodeJS.ProcessEnv = process.env): Set<string> {
  return new Set(
    (env.SMTP_ALLOWED_RECIPIENTS ?? "")
      .split(",")
      .map(item => item.trim().toLowerCase())
      .filter(item => SINGLE_RECIPIENT.test(item)),
  );
}

/**
 * O SMTP live do piloto só abre conexão no DEV (`IDBRF_RUNTIME_STAGE=qa`)
 * e só para a caixa de teste listada no ambiente. HML, produção e qualquer
 * outro destino ficam fora do envio externo.
 */
export function assertLiveSmtpRecipient(env: NodeJS.ProcessEnv, to: string): void {
  const stage = (env.IDBRF_RUNTIME_STAGE ?? "").trim().toLowerCase();
  if (stage === "production" || stage === "hml") {
    throw new ServiceUnavailableException(
      "O SMTP live do piloto permanece desligado em HML e produção.",
    );
  }
  if (stage !== "qa") {
    throw new ServiceUnavailableException(
      "O SMTP live exige IDBRF_RUNTIME_STAGE=qa na API isolada do DEV.",
    );
  }
  const allowed = smtpAllowedRecipients(env);
  if (allowed.size === 0) {
    throw new ServiceUnavailableException(
      "SMTP_ALLOWED_RECIPIENTS vazio. O DEV não envia para fora da caixa de teste.",
    );
  }
  const recipient = to.trim().toLowerCase();
  if (!SINGLE_RECIPIENT.test(recipient) || !allowed.has(recipient)) {
    throw new BadRequestException(
      "Este DEV só entrega na caixa de teste autorizada. A mensagem não sai por SMTP.",
    );
  }
}
