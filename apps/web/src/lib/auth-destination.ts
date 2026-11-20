import type { LoginResult } from "./api";
import { areaAllowed, landingForRoles, type AppDestination } from "./persona-navigation";
import { memberEventsHref, validEventSlug } from "./public-event-registration";

/**
 * Roteamento após autenticação. Permissões de leitura/escrita continuam
 * determinadas pelo backend; esta função apenas escolhe a área inicial.
 */
export function authenticatedLanding(
  user: LoginResult["user"], eventSlug?: string | null,
): AppDestination | ReturnType<typeof memberEventsHref> {
  const roles = user.grants.map(grant => grant.roleCode);
  return eventSlug && validEventSlug(eventSlug) && areaAllowed(roles, "eventos-membro")
    ? memberEventsHref(eventSlug)
    : landingForRoles(roles);
}
