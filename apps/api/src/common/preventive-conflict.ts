import { createHmac } from "node:crypto";
import {
  PREVENTIVE_COPY,
  type PreventiveCode,
  type PreventiveDecision,
  type PreventiveExisting,
} from "@idbrf/shared";
import { BusinessException } from "./business.exception";

/** Referência mínima para o cliente abrir o registro. Sem contato, documento ou endereço. */
export function safeExisting(existing: PreventiveExisting | undefined): { existing: PreventiveExisting } | undefined {
  if (!existing?.id || !existing.status) return undefined;
  return { existing: { id: existing.id, status: existing.status } };
}

export function throwPreventive(decision: PreventiveDecision): void {
  if (decision.action !== "conflict" || !decision.code) return;
  const copy = PREVENTIVE_COPY[decision.code];
  throw new BusinessException(copy.message, decision.code, 409, {
    ...safeExisting(decision.existing),
    ...(decision.blocking ? { blocking: true } : {}),
  });
}

export function preventiveConflict(code: PreventiveCode, existing?: PreventiveExisting, blocking = false): BusinessException {
  const copy = PREVENTIVE_COPY[code];
  return new BusinessException(copy.message, code, 409, {
    ...safeExisting(existing),
    ...(blocking ? { blocking: true } : {}),
  });
}

/** HMAC por congregação. O CPF em claro não entra no retorno nem deve ser registrado em log. */
export function identityFingerprint(organizationId: string, digits: string, pepper: string): string {
  return createHmac("sha256", pepper).update(`${organizationId}:${digits}`).digest("hex");
}

export function identityPepper(): string | null {
  const pepper = process.env.PERSON_IDENTITY_PEPPER?.trim() ?? "";
  return pepper.length >= 16 ? pepper : null;
}
