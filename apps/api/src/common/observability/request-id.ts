import { randomBytes } from "node:crypto";

const SAFE_REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$/;
const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const CPF_SHAPE = /^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/;
const CNPJ_SHAPE = /^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/;

/**
 * Aceita só um id opaco. Rejeita JWT, CPF, CNPJ, espaços e quebra de linha
 * para o valor não virar injeção de log nem carregar credencial.
 */
export function isSafeRequestId(value: string): boolean {
  if (!SAFE_REQUEST_ID.test(value)) return false;
  if (JWT_SHAPE.test(value)) return false;
  if (CPF_SHAPE.test(value) || CNPJ_SHAPE.test(value)) return false;
  if (/^\d{11}$/.test(value) || /^\d{14}$/.test(value)) return false;
  if (/bearer|password|senha|secret/i.test(value)) return false;
  return true;
}

export function generateRequestId(): string {
  return `req_${randomBytes(16).toString("hex")}`;
}

export function resolveRequestId(
  header: string | string[] | undefined,
): { id: string; generated: boolean } {
  const raw = Array.isArray(header) ? header[0] : header;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (isSafeRequestId(trimmed)) return { id: trimmed, generated: false };
  }
  return { id: generateRequestId(), generated: true };
}
