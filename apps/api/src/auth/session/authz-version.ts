import { createHash } from "node:crypto";
import type { AuthGrant } from "@idbrf/shared";

/**
 * Versão de política embutida no fingerprint.
 * Subir AUTHZ_POLICY_VERSION (env) invalida todas as sessões no próximo uso.
 */
export const AUTHZ_POLICY_VERSION = "f11a-2026-11-11";

export interface AuthzMaterial {
  status: string;
  mfaRequired: boolean;
  email: string;
  personId: string;
  /** `STATUS:factorId` ou `NONE`. Rotacionar TOTP muda a versão. */
  factorState: string;
  grants: AuthGrant[];
}

export function authzVersion(
  material: AuthzMaterial,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const policy = env.AUTHZ_POLICY_VERSION?.trim() || AUTHZ_POLICY_VERSION;
  const grants = [...material.grants]
    .map((grant) =>
      [
        grant.roleCode,
        grant.organizationId ?? "",
        grant.churchId ?? "",
        grant.ministryId ?? "",
      ].join(":"),
    )
    .sort((left, right) => left.localeCompare(right, "en", { sensitivity: "variant" }))
    .join("|");
  return createHash("sha256")
    .update(
      [
        policy,
        material.status,
        material.mfaRequired ? "1" : "0",
        material.email,
        material.personId,
        material.factorState,
        grants,
      ].join("\n"),
    )
    .digest("hex");
}

export function factorStateOf(
  factors: Array<{ id?: string; status?: string }> | null | undefined,
): string {
  const totp = factors?.[0];
  if (!totp?.status) {
    return "NONE";
  }
  return `${totp.status}:${totp.id ?? ""}`;
}
