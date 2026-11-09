import { SetMetadata } from "@nestjs/common";
import type { AccessAction, AccessResource } from "@idbrf/shared";
import { ACCESS_POLICY_KEY } from "../auth.constants";

export interface RequiredAccessMeta {
  resource: AccessResource;
  action: AccessAction;
}

/**
 * Declara recurso e ação da matriz A3.
 * Sem este decorator, AccessPolicyGuard classifica o path conhecido
 * e deixa rotas fora do catálogo para o @Roles existente.
 */
export const RequireAccess = (meta: RequiredAccessMeta) =>
  SetMetadata(ACCESS_POLICY_KEY, meta);
