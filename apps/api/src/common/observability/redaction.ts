/** Marcador estável. Não é reversível e não repete o valor original. */
export const REDACTED = "[redacted]";

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const BEARER = /bearer\s+[A-Za-z0-9\-._~+/=]+/gi;
const BASIC = /basic\s+[A-Za-z0-9+/=]+/gi;
const JWT = /\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\b/g;
const SECRET_ASSIGN =
  /\b(password|passwd|senha|secret|token|api[_-]?key|authorization|cookie|set-cookie|cpf|cnpj)\b\s*[:=]\s*\S+/gi;
const URL_WITH_SCHEME = /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>]+/gi;
const CPF_FORMATTED = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const CNPJ_FORMATTED = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g;
const DIGITS_11 = /(?<!\d)\d{11}(?!\d)/g;
const DIGITS_14 = /(?<!\d)\d{14}(?!\d)/g;
const IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const SQL =
  /\b(select|insert|update|delete|drop|alter)\b[\s\S]{0,160}?\b(from|into|set|table|database)\b/gi;
const STACK_LINE = /(?:^|\n)\s*at\s+[^\n]+/g;

/**
 * Mascara segredo, documento, e-mail, SQL e URL antes de qualquer escrita.
 * A função é pura: a mesma entrada produz a mesma saída, sem consultar ambiente.
 */
export function redactText(value: string): string {
  let out = value.replace(STACK_LINE, " ");
  out = out.replace(URL_WITH_SCHEME, REDACTED);
  out = out.replace(BEARER, REDACTED);
  out = out.replace(BASIC, REDACTED);
  out = out.replace(JWT, REDACTED);
  out = out.replace(SECRET_ASSIGN, REDACTED);
  out = out.replace(EMAIL, REDACTED);
  out = out.replace(CNPJ_FORMATTED, REDACTED);
  out = out.replace(CPF_FORMATTED, REDACTED);
  out = out.replace(DIGITS_14, REDACTED);
  out = out.replace(DIGITS_11, REDACTED);
  out = out.replace(SQL, REDACTED);
  out = out.replace(IPV4, REDACTED);
  return out;
}
