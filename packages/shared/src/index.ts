export type {
  PersonId,
  OrganizationId,
  ChurchId,
  UserId,
  RoleCode,
} from "./ids";

export {
  isPersonId,
  assertPersonId,
  samePersonId,
} from "./person-id";

export {
  ROLE_CODES,
  grantMatchesScope,
  hasAccess,
  type BuiltInRoleCode,
  type GrantScope,
  type AuthGrant,
  type AccessCheck,
} from "./rbac";

export interface HealthStatus {
  status: "ok" | "degraded" | "down";
  service: string;
  timestamp: string;
}

export const APP_NAME = "Igreja de Deus — Riacho Fundo I";
export const APP_SLUG = "igreja-deus-riacho-fundo-1";

export function createHealthStatus(
  service: string,
  status: HealthStatus["status"] = "ok",
): HealthStatus {
  return {
    status,
    service,
    timestamp: new Date().toISOString(),
  };
}
