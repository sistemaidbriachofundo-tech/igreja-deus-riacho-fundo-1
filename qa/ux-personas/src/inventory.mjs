import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const repoRoot = join(here, "../../..");
const appDir = join(repoRoot, "apps/web/src/app");

export function pageRoutes() {
  const routes = [];
  function walk(dir, prefix) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full, `${prefix}/${entry}`);
        continue;
      }
      if (entry === "page.tsx") routes.push(prefix === "" ? "/" : `${prefix}/`);
    }
  }
  walk(appDir, "");
  return routes.sort();
}

/**
 * Casos da auditoria. Telas sem rota integrada nascem BLOCKED.
 * O harness de navegador só preenche os casos `visual`.
 */
export const cases = [
  {
    id: "UX-01",
    area: "Portal público",
    surface: "Início",
    route: "/",
    kind: "visual",
    profile: "visitante",
  },
  {
    id: "UX-02",
    area: "Portal público",
    surface: "Quem somos",
    route: "/a-igreja/",
    kind: "visual",
    profile: "visitante",
  },
  {
    id: "UX-03",
    area: "Portal público",
    surface: "Agenda e estado vazio",
    route: "/eventos/",
    kind: "visual",
    profile: "visitante",
  },
  {
    id: "UX-04",
    area: "Login",
    surface: "Formulário na publicação (acesso desligado)",
    route: "/login/",
    kind: "visual",
    profile: "não autenticado",
  },
  {
    id: "UX-05",
    area: "Login",
    surface: "Gate de /app e /app/secretaria sem sessão",
    route: "/app/secretaria/",
    kind: "visual",
    profile: "não autenticado",
  },
  {
    id: "UX-06",
    area: "Login",
    surface: "Erro com credencial sintética recusada",
    route: "/login/",
    kind: "visual-hml",
    profile: "não autenticado",
  },
  {
    id: "UX-07",
    area: "HML Secretaria",
    surface: "Workspace autenticado de fichas",
    route: "/app/secretaria/",
    kind: "blocked",
    profile: "SECRETARIA",
    reason:
      "A rota integrada existe, mas o workspace só aparece depois de /auth/me. Esta auditoria não abre sessão, não sobe banco e não usa credencial. O PR #106 (ficha) não está na main.",
  },
  {
    id: "UX-08",
    area: "Pastor",
    surface: "Dashboard pastoral",
    route: null,
    kind: "blocked",
    profile: "PASTOR",
    reason:
      "Não há página de dashboard do pastor. Cuidado pastoral está em DasOperations, atrás da sessão, e o próprio painel HML marca essa integração como pendente.",
  },
  {
    id: "UX-09",
    area: "Admin",
    surface: "Dashboard de plataforma",
    route: null,
    kind: "blocked",
    profile: "PLATFORM_ADMIN",
    reason:
      "Não há rota /app/admin nem painel exclusivo do administrador. O gate de /app é a única superfície integrada sem sessão.",
  },
  {
    id: "UX-10",
    area: "Tesouraria",
    surface: "Dashboard financeiro",
    route: null,
    kind: "blocked",
    profile: "TESOURARIA",
    reason:
      "Não há rota de tesouraria. FinanceBoard só entra em /app/operacao depois da sessão. O PR #108 não está integrado e não foi aberto nesta auditoria.",
  },
  {
    id: "UX-11",
    area: "Líder",
    surface: "Dashboard do líder de ministério",
    route: null,
    kind: "blocked",
    profile: "LIDER_MINISTERIO",
    reason:
      "Não há dashboard do líder. O desvio pós-login para /app/operacao está no código, mas a tela autenticada não foi exercitada.",
  },
  {
    id: "UX-12",
    area: "Membro",
    surface: "Dashboard do membro",
    route: null,
    kind: "blocked",
    profile: "MEMBRO",
    reason:
      "Não há portal do membro. /app/demo troca de perfil com dados sintéticos locais, porém o layout /app esconde a página atrás do login.",
  },
  {
    id: "UX-13",
    area: "Fundação #102",
    surface: "Vitrine /design-system",
    route: "/design-system/",
    kind: "blocked",
    profile: "fundação",
    reason:
      "O PR #102 está em rascunho e não faz parte da main. A vitrine e os componentes ui/ não foram copiados para esta branch.",
  },
];

export function blockedCases() {
  return cases.filter((item) => item.kind === "blocked");
}

export function readFoundationTokens() {
  try {
    const text = execFileSync(
      "git",
      ["show", "origin/cursor/design-system-foundation-c0e3:apps/web/src/components/ui/tokens.ts"],
      { cwd: repoRoot, encoding: "utf8" },
    );
    return { available: true, text };
  } catch {
    return { available: false, text: "" };
  }
}

export function designSystemIsOnMain() {
  return existsSync(join(repoRoot, "apps/web/src/components/ui/Button.tsx"));
}
