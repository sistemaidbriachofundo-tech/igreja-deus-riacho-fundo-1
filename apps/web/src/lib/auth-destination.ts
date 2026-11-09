import type { LoginResult } from "./api";

/**
 * Roteamento após autenticação. Permissões de leitura/escrita continuam
 * determinadas pelo backend; esta função apenas escolhe a área inicial.
 */
export function authenticatedLanding(user: LoginResult["user"]): "/app/" | "/app/operacao/" {
  const roles = new Set(user.grants.map(grant => grant.roleCode));
  if (roles.has("LIDER_MINISTERIO")
      && !roles.has("SECRETARIA")
      && !roles.has("PASTOR")
      && !roles.has("TESOURARIA")) {
    return "/app/operacao/";
  }
  return "/app/";
}
