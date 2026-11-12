/** Marcador estável. Não é reversível e não repete o valor original. */
export const REDACTED = "[redacted]";

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
/**
 * Mascara segredo, documento, e-mail, SQL e URL antes de qualquer escrita.
 * A função é pura: a mesma entrada produz a mesma saída, sem consultar ambiente.
 */
export function redactText(value: string): string {
  let out = stripStackLines(value);
  out = out.replace(URL_WITH_SCHEME, REDACTED);
  out = out.replace(BEARER, REDACTED);
  out = out.replace(BASIC, REDACTED);
  out = out.replace(JWT, REDACTED);
  out = out.replace(SECRET_ASSIGN, REDACTED);
  out = maskEmails(out);
  out = out.replace(CNPJ_FORMATTED, REDACTED);
  out = out.replace(CPF_FORMATTED, REDACTED);
  out = out.replace(DIGITS_14, REDACTED);
  out = out.replace(DIGITS_11, REDACTED);
  out = out.replace(SQL, REDACTED);
  out = out.replace(IPV4, REDACTED);
  return out;
}

function isEmailLocal(char: string): boolean {
  return /[A-Za-z0-9._%+-]/.test(char);
}

function isEmailDomain(char: string): boolean {
  return /[A-Za-z0-9.-]/.test(char);
}

function isLetter(char: string): boolean {
  return /[A-Za-z]/.test(char);
}

/** Troca e-mails por um marcador sem quantificador aninhado. */
function maskEmails(value: string): string {
  let out = "";
  let index = 0;
  while (index < value.length) {
    const at = value.indexOf("@", index);
    if (at < 0) {
      out += value.slice(index);
      break;
    }
    let start = at;
    while (start > index && isEmailLocal(value[start - 1])) start -= 1;
    let end = at + 1;
    let lastDot = -1;
    while (end < value.length && isEmailDomain(value[end])) {
      if (value[end] === ".") lastDot = end;
      end += 1;
    }
    let tld = 0;
    for (let cursor = lastDot + 1; lastDot > at && cursor < end && isLetter(value[cursor]); cursor += 1) {
      tld += 1;
    }
    if (start < at && lastDot > at + 1 && tld >= 2 && lastDot + 1 + tld === end) {
      out += value.slice(index, start) + REDACTED;
      index = end;
    } else {
      out += value.slice(index, at + 1);
      index = at + 1;
    }
  }
  return out;
}

function stripStackLines(value: string): string {
  let out = "";
  let index = 0;
  while (index < value.length) {
    const newline = value.indexOf("\n", index);
    const end = newline < 0 ? value.length : newline;
    const line = value.slice(index, end);
    let cursor = 0;
    while (cursor < line.length && (line[cursor] === " " || line[cursor] === "\t")) cursor += 1;
    const rest = line.slice(cursor);
    const stack = rest.startsWith("at ") || rest.startsWith("at\t");
    out += stack ? " " : line;
    if (newline < 0) break;
    out += "\n";
    index = newline + 1;
  }
  return out;
}
