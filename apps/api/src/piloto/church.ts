import { ForbiddenException } from "@nestjs/common";
import { hasAccess, scopeCovers, type OperationalScopeKind } from "@idbrf/shared";
import type { AuthUser } from "../auth/types/auth-user";
import type { PilotChurch } from "../pilot/pilot.service";

const STAFF = new Set(["PLATFORM_ADMIN", "SECRETARIA", "PASTOR"]);

export function assertChurchRole(actor: AuthUser, pilot: PilotChurch, roleCodes: readonly string[]) {
  const allowed = hasAccess(actor.grants, {
    roleCodes: [...roleCodes],
    organizationId: pilot.organizationId,
    churchId: pilot.churchId,
  });
  if (!allowed || (actor.organizationId && actor.organizationId !== pilot.organizationId)
    || (actor.churchId && actor.churchId !== pilot.churchId)) {
    throw new ForbiddenException("Sem permissão nesta congregação.");
  }
}

/** Igreja, secretaria e pastor cobrem a congregação. Líder com vínculo só alcança o escopo gravado. */
export function assertOperationalScope(
  actor: AuthUser,
  bindings: readonly { kind: OperationalScopeKind; scopeId: string }[],
  kind: OperationalScopeKind,
  scopeId: string,
) {
  if (actor.grants.some(grant => STAFF.has(grant.roleCode))) return;
  if (!scopeCovers({ bindings, kind, scopeId })) {
    throw new ForbiddenException("O escopo deste perfil não cobre o registro.");
  }
}
