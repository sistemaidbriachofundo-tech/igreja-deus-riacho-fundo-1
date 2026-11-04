import { SetMetadata } from "@nestjs/common";
import { SCOPE_KEY, type RequiredScopeMeta } from "../auth.constants";

/**
 * Escopo ABAC mínimo: nomes dos params de rota/query que carregam
 * organizationId / churchId (resolvidos no ScopeGuard).
 */
export const RequireScope = (meta: RequiredScopeMeta) =>
  SetMetadata(SCOPE_KEY, meta);
