import { BadRequestException } from "@nestjs/common";

/** Mensagem única: não revela qual regra falhou. */
export const PASSWORD_POLICY_MESSAGE =
  "A senha não atende a política de acesso.";

const COMMON_FRAGMENTS = [
  "password",
  "senha",
  "qwerty",
  "abc123",
  "admin",
  "igreja",
  "riacho",
  "secretaria",
  "tesouraria",
  "123456",
];

/**
 * Política de definição de senha (cadastro de acesso).
 * Não é aplicada no login: senhas já gravadas em QA continuam válidas
 * e ninguém fica trancado de forma irreversível.
 */
export function assertPasswordPolicy(password: string, email: string): void {
  if (!passwordMeetsPolicy(password, email)) {
    throw new BadRequestException(PASSWORD_POLICY_MESSAGE);
  }
}

export function passwordMeetsPolicy(password: string, email: string): boolean {
  if (typeof password !== "string" || password.length < 14 || password.length > 128) {
    return false;
  }
  if (/\s/.test(password)) {
    return false;
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    return false;
  }
  const normalized = password.toLowerCase();
  if (COMMON_FRAGMENTS.some((fragment) => normalized.includes(fragment))) {
    return false;
  }
  const mailbox = email.trim().toLowerCase();
  if (mailbox.length >= 4 && normalized.includes(mailbox)) {
    return false;
  }
  const local = mailbox.split("@")[0] ?? "";
  if (local.length >= 4 && normalized.includes(local)) {
    return false;
  }
  return true;
}
