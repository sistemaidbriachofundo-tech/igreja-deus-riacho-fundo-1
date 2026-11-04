import type { PersonId } from "./ids";

/** Comprimento típico de cuid() usado como person_id. */
const PERSON_ID_MIN_LEN = 8;
const PERSON_ID_MAX_LEN = 64;
const PERSON_ID_PATTERN = /^[a-z][a-z0-9_-]*$/i;

/**
 * Valida formato do person_id (chave estável do domínio).
 * Não consulta banco — só formato.
 */
export function isPersonId(value: unknown): value is PersonId {
  if (typeof value !== "string") {
    return false;
  }
  const trimmed = value.trim();
  return (
    trimmed.length >= PERSON_ID_MIN_LEN &&
    trimmed.length <= PERSON_ID_MAX_LEN &&
    PERSON_ID_PATTERN.test(trimmed)
  );
}

/** Normaliza person_id (trim). Lança se inválido. */
export function assertPersonId(value: unknown): PersonId {
  if (!isPersonId(value)) {
    throw new Error("person_id inválido");
  }
  return value.trim();
}

/** Compara dois person_id de forma estável (trim + igualdade). */
export function samePersonId(a: unknown, b: unknown): boolean {
  if (!isPersonId(a) || !isPersonId(b)) {
    return false;
  }
  return a.trim() === b.trim();
}
