import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RolesGuard } from "./roles.guard";
import type { AuthUser } from "../types/auth-user";

/**
 * Papéis da leitura principal de cada área do painel.
 * O teste da web confere esta tabela com persona-navigation.ts e com os controllers.
 * O guard abaixo é o que transforma papel ausente em 403 e sessão ausente em 401.
 */
const PROBES: { key: string; path: string; roles: string[] }[] = [
  { key: "membros", path: "/persons/search", roles: ["SECRETARIA", "PASTOR", "PLATFORM_ADMIN"] },
  { key: "secretaria", path: "/admissions", roles: ["SECRETARIA", "PASTOR", "PLATFORM_ADMIN"] },
  { key: "carteirinha", path: "/credentials/me", roles: ["MEMBRO", "SECRETARIA", "PLATFORM_ADMIN"] },
  { key: "ministerios", path: "/ministry-scope/:id/formal-memberships", roles: ["SECRETARIA", "PASTOR", "LIDER_MINISTERIO", "PLATFORM_ADMIN"] },
  { key: "escalas", path: "/rosters", roles: ["SECRETARIA", "PASTOR", "LIDER_MINISTERIO", "PLATFORM_ADMIN"] },
  { key: "atmosfera", path: "/rosters", roles: ["SECRETARIA", "PASTOR", "LIDER_MINISTERIO", "PLATFORM_ADMIN"] },
  { key: "meu-espaco", path: "/rosters/:assignmentId/confirm", roles: ["SECRETARIA", "PASTOR", "LIDER_MINISTERIO", "PLATFORM_ADMIN", "MEMBRO"] },
  { key: "tesouraria", path: "/ledger/accounts", roles: ["TESOURARIA", "PLATFORM_ADMIN"] },
  { key: "tesouraria", path: "/ledger/expense-approvals", roles: ["TESOURARIA", "PASTOR"] },
  { key: "acessos", path: "/admin/access", roles: ["PLATFORM_ADMIN"] },
  { key: "editorial", path: "/cms/contents", roles: ["SECRETARIA", "PASTOR", "PLATFORM_ADMIN"] },
  { key: "site", path: "/cms/site-layout", roles: ["EDITOR_SITE", "PUBLICADOR_SITE", "SECRETARIA", "PASTOR", "PLATFORM_ADMIN"] },
];

const ACTORS = [
  "PLATFORM_ADMIN",
  "SECRETARIA",
  "PASTOR",
  "TESOURARIA",
  "LIDER_MINISTERIO",
  "MEMBRO",
  "EDITOR_SITE",
  "PUBLICADOR_SITE",
] as const;

function contextFor(user?: AuthUser) {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as never;
}

describe("navegação por persona — 403 direto no guard", () => {
  it.each(PROBES.map(area => [area.path, area] as const))(
    "%s recusa papel ausente e sessão ausente",
    (_key, area) => {
      const reflector = { getAllAndOverride: () => area.roles } as unknown as Reflector;
      const guard = new RolesGuard(reflector);
      expect(() => guard.canActivate(contextFor())).toThrow(UnauthorizedException);

      for (const role of ACTORS) {
        const user: AuthUser = {
          userId: "u-sintetico",
          personId: "p-sintetico",
          email: "persona.demo@example.test",
          grants: [{ roleCode: role, organizationId: "org-demo" }],
        };
        if (area.roles.includes(role)) {
          expect(guard.canActivate(contextFor(user))).toBe(true);
        } else {
          expect(() => guard.canActivate(contextFor(user))).toThrow(ForbiddenException);
        }
      }
    },
  );
});
