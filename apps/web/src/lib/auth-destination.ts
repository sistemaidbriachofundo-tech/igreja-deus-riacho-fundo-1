import type { LoginResult } from "./api";
import { landingForRoles, type AppDestination } from "./persona-navigation";

/**
 * Roteamento após autenticação. Permissões de leitura/escrita continuam
 * determinadas pelo backend; esta função apenas escolhe a área inicial.
 */
export function authenticatedLanding(user: LoginResult["user"]): AppDestination {
  return landingForRoles(user.grants.map(grant => grant.roleCode));
}
