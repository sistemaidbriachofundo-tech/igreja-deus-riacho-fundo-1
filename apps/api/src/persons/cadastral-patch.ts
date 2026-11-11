import { normalizePersonSearchText, type PersonProfileFields } from "@idbrf/shared";
import { BusinessException } from "../common/business.exception";

/**
 * Campos de pessoa que este PATCH grava.
 * Situação, tipo eclesiástico e telefones permanecem fora do cadastro editável.
 */
export interface CadastralPersonPatch extends PersonProfileFields {
  displayName?: string;
  email?: string | null;
  isMinor?: boolean;
  legalGuardianPersonId?: string | null;
  householdId?: string | null;
  expectedUpdatedAt?: string;
  status?: string;
  kind?: string;
  phone?: string;
  mobilePhone?: string;
  address?: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeProfileDate(value: string | null): Date | null {
  if (value === null) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(+parsed) ||
      parsed.toISOString().slice(0, 10) !== value || parsed.getUTCFullYear() < 1850 ||
      value > new Date().toISOString().slice(0, 10)) {
    throw new BusinessException("Informe uma data válida até hoje.", "PERSON_PROFILE_DATE_INVALID", 400);
  }
  return parsed;
}

export function rejectPersonPatchPolicy(input: CadastralPersonPatch): void {
  if (
    input.phone !== undefined ||
    input.mobilePhone !== undefined
  ) {
    throw new BusinessException(
      "Telefone não existe no cadastro atual. A gravação foi recusada.",
      "PERSON_CONTACT_UNSUPPORTED",
      400,
    );
  }
  if (input.status !== undefined) {
    throw new BusinessException(
      "Situação da pessoa não muda por este PATCH. Não há fluxo regulado de inativação.",
      "PERSON_STATUS_REGULATED",
      400,
    );
  }
  if (input.kind !== undefined) {
    throw new BusinessException(
      "Tipo visitante/membro só muda na aprovação pastoral da admissão.",
      "PERSON_KIND_REGULATED",
      400,
    );
  }
}

export function normalizeDisplayName(value: string): string {
  const displayName = value.trim().replace(/\s+/g, " ");
  if (displayName.length < 2 || displayName.length > 160) {
    throw new BusinessException(
      "displayName precisa ter entre 2 e 160 caracteres.",
      "PERSON_NAME_INVALID",
      400,
    );
  }
  return displayName;
}

export function normalizePersonEmail(value: string | null): string | null {
  if (value === null) return null;
  const email = value.trim().toLowerCase();
  if (
    !email ||
    email.length > 254 ||
    !EMAIL_RE.test(email) ||
    email.includes("..")
  ) {
    throw new BusinessException(
      "E-mail de contato inválido.",
      "PERSON_EMAIL_INVALID",
      400,
    );
  }
  return email;
}

export function parseExpectedUpdatedAt(value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BusinessException(
      "expectedUpdatedAt precisa ser uma data ISO-8601.",
      "VERSION_INVALID",
      400,
    );
  }
  return date;
}

export function collectNameDedupeAlerts(
  displayName: string,
  rows: Array<{ id: string; displayName: string }>,
): Array<{ personId: string; matchReasons: ["normalizedDisplayName"] }> {
  const norm = normalizePersonSearchText(displayName);
  const alerts: Array<{
    personId: string;
    matchReasons: ["normalizedDisplayName"];
  }> = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    if (normalizePersonSearchText(row.displayName) !== norm) continue;
    seen.add(row.id);
    alerts.push({
      personId: row.id,
      matchReasons: ["normalizedDisplayName"],
    });
  }
  return alerts;
}
