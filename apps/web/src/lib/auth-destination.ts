import type { LoginResult } from "./api";
import { landingForRoles, type AppDestination } from "./persona-navigation";
import { eventRegistrationHref, validEventSlug } from "./public-event-registration";

/**
 * Roteamento após autenticação. Permissões de leitura/escrita continuam
 * determinadas pelo backend; esta função apenas escolhe a área inicial.
 */
export function authenticatedLanding(
  user: LoginResult["user"], eventSlug?: string | null,
): AppDestination | ReturnType<typeof eventRegistrationHref> {
  if (eventSlug && validEventSlug(eventSlug)) return eventRegistrationHref(eventSlug);
  return landingForRoles(user.grants.map(grant => grant.roleCode));
}
