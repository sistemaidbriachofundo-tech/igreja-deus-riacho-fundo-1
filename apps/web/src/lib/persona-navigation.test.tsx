import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AppShell } from "../components/AppShell";
import { PersonaBoard } from "../components/PersonaHome";
import type { AuthUser } from "./api";
import { canViewDasModule, DAS_MODULES } from "./das-operations";
import {
  BUILTIN_ROLES, PERSONA_AREAS, accountInitials, areaAllowed, areasForRoles,
  expectedAccessStatus, landingForRoles, personaLabel,
} from "./persona-navigation";

const repoRoot = join(__dirname, "../../../..");
const originalHml = process.env.NEXT_PUBLIC_HML_ENABLED;

afterEach(() => {
  if (originalHml === undefined) delete process.env.NEXT_PUBLIC_HML_ENABLED;
  else process.env.NEXT_PUBLIC_HML_ENABLED = originalHml;
});

function account(role: string, email = `${role.toLowerCase()}@example.test`): AuthUser {
  return { userId: `u-${role}`, personId: `p-${role}`, email, grants: [{ roleCode: role }] };
}

function hrefs(html: string): string[] {
  // Static export applies NEXT_PUBLIC_BASE_PATH to links in CI/Pages.
  // Test the logical app routes without assuming the deployment mount point.
  const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/+$/, "");
  return [...html.matchAll(/href="([^"]+)"/g)].map(match => {
    const href = match[1] ?? "";
    return basePath && (href === basePath || href.startsWith(`${basePath}/`))
      ? href.slice(basePath.length) || "/"
      : href;
  });
}

const MENU: Record<(typeof BUILTIN_ROLES)[number], string[]> = {
  PLATFORM_ADMIN: ["visao", "membros", "secretaria", "carteirinha", "operacao", "ministerios", "escalas", "atmosfera", "meu-espaco", "editorial", "site"],
  SECRETARIA: ["visao", "membros", "secretaria", "carteirinha", "operacao", "ministerios", "escalas", "atmosfera", "meu-espaco", "editorial", "site"],
  PASTOR: ["visao", "membros", "secretaria", "operacao", "ministerios", "escalas", "atmosfera", "meu-espaco", "editorial", "site"],
  TESOURARIA: ["visao", "operacao", "tesouraria"],
  LIDER_MINISTERIO: ["visao", "operacao", "ministerios", "escalas", "atmosfera", "meu-espaco", "editorial"],
  MEMBRO: ["visao", "carteirinha", "meu-espaco"],
  EDITOR_SITE: ["visao", "site"],
  PUBLICADOR_SITE: ["visao", "site"],
};

describe("menu por persona", () => {
  it.each(BUILTIN_ROLES)("lista só as áreas autorizadas para %s", role => {
    const keys = areasForRoles([role]).map(area => area.key);
    expect(keys).toEqual(MENU[role]);
    for (const area of PERSONA_AREAS) {
      const visible = keys.includes(area.key);
      if (area.key === "visao") {
        expect(visible).toBe(true);
        continue;
      }
      expect(visible).toBe(area.roles.includes(role));
    }
  });

  it("une papéis sem abrir tesouraria para quem também é secretaria só por estar autenticado", () => {
    const keys = areasForRoles(["SECRETARIA", "TESOURARIA"]).map(area => area.key);
    expect(keys).toContain("tesouraria");
    expect(keys).toContain("secretaria");
    expect(areasForRoles(["MEMBRO", "EDITOR_SITE"]).map(area => area.key)).toEqual(
      ["visao", "carteirinha", "meu-espaco", "site"],
    );
  });

  it("escolhe a página inicial sem conceder módulo financeiro ao líder", () => {
    expect(landingForRoles(["LIDER_MINISTERIO"])).toBe("/app/operacao/");
    expect(landingForRoles(["TESOURARIA"])).toBe("/app/");
    expect(landingForRoles(["LIDER_MINISTERIO", "SECRETARIA"])).toBe("/app/");
    expect(landingForRoles(["EDITOR_SITE"])).toBe("/app/site/");
    expect(landingForRoles(["PUBLICADOR_SITE"])).toBe("/app/site/");
    expect(landingForRoles(["MEMBRO"])).toBe("/app/servir/meu-espaco/");
    expect(landingForRoles(["PLATFORM_ADMIN"])).toBe("/app/");
  });

  it("identifica a conta pelo e-mail conhecido, sem inventar um nome", () => {
    expect(accountInitials("ana.demo@example.test")).toBe("AN");
    expect(personaLabel(["PASTOR"])).toBe("Pastor");
    expect(personaLabel(["EDITOR_SITE", "PUBLICADOR_SITE"])).toBe("Edição do site · Publicação do site");
  });

  it("só oferece operação a quem tem ao menos um módulo do DAS", () => {
    const operacao = PERSONA_AREAS.find(area => area.key === "operacao");
    expect(operacao).toBeTruthy();
    for (const role of operacao?.roles ?? []) {
      const visible = DAS_MODULES.filter(module => canViewDasModule([role], module.allowedRoles));
      expect(visible.length, role).toBeGreaterThan(0);
    }
    for (const role of ["MEMBRO", "EDITOR_SITE", "PUBLICADOR_SITE"]) {
      expect(areaAllowed([role], "operacao")).toBe(false);
    }
  });
});

describe("rota direta e 403 do servidor", () => {
  it("espelha a decisão do guard: 401 sem sessão, 403 sem o papel, 200 com o papel", () => {
    for (const area of PERSONA_AREAS) {
      if (!area.probe) continue;
      expect(expectedAccessStatus(null, area.roles)).toBe(401);
      for (const role of BUILTIN_ROLES) {
        const status = expectedAccessStatus([role], area.roles);
        expect(status, `${role} ${area.probe.path}`).toBe(area.roles.includes(role) ? 200 : 403);
      }
    }
  });

  it("mantém o spec do guard alinhado ao menu", () => {
    const spec = readFileSync(join(repoRoot, "apps/api/src/auth/guards/persona-route-denial.spec.ts"), "utf8");
    for (const area of PERSONA_AREAS) {
      if (!area.probe) continue;
      const block = spec.split(`key: "${area.key}"`)[1]?.split("},")[0] ?? "";
      expect(block, area.key).toContain(area.probe.path);
      for (const role of area.roles) expect(block, `${area.key} ${role}`).toContain(role);
      for (const role of BUILTIN_ROLES) {
        if (!area.roles.includes(role)) expect(block, `${area.key} não inclui ${role}`).not.toContain(role);
      }
    }
  });

  it("declara no controller os mesmos papéis que o menu usa para não prometer um 200", () => {
    for (const area of PERSONA_AREAS) {
      if (!area.probe) continue;
      const source = readFileSync(join(repoRoot, area.probe.source), "utf8");
      const at = source.indexOf(area.probe.marker);
      expect(at, area.key).toBeGreaterThan(-1);
      const window = source.slice(Math.max(0, at - 1800), at);
      for (const role of area.roles) expect(window, `${area.key} ${role}`).toContain(role);
    }
  });
});

describe("shell sem flash de módulo restrito", () => {
  it("não renderiza o módulo nem o link antes de confirmar a sessão", () => {
    process.env.NEXT_PUBLIC_HML_ENABLED = "true";
    const html = renderToStaticMarkup(
      <AppShell active="tesouraria" meta="Tesouraria · HML sintética">
        <p>SALDO-QUE-NAO-PODE-APARECER</p>
      </AppShell>,
    );
    expect(html).toContain('data-nav-state="pending"');
    expect(html).not.toContain("SALDO-QUE-NAO-PODE-APARECER");
    expect(html).not.toContain("/app/tesouraria/");
    expect(html).toContain("Confirmando seu perfil");
    expect(html).toContain("Sair");
  });

  it("membro não vê tesouraria, secretaria nem pessoas e a rota direta não monta o módulo", () => {
    process.env.NEXT_PUBLIC_HML_ENABLED = "true";
    const member = account("MEMBRO", "membro.demo@example.test");
    const menu = renderToStaticMarkup(
      <AppShell active="visao" meta="Início" viewer={member}><PersonaBoard /></AppShell>,
    );
    const links = hrefs(menu);
    expect(links).toContain("/app/servir/meu-espaco/");
    expect(links).toContain("/app/membros/carteirinha/");
    expect(links).not.toContain("/app/tesouraria/");
    expect(links).not.toContain("/app/secretaria/");
    expect(links).not.toContain("/app/membros/");
    expect(links).not.toContain("/app/editorial/");
    expect(menu).toContain("membro.demo@example.test");
    expect(menu).toContain("Membro");
    expect(menu).toContain("Sair");
    expect(menu).not.toContain("R$");

    const denied = renderToStaticMarkup(
      <AppShell active="tesouraria" meta="Tesouraria · HML sintética" viewer={member}>
        <p>SALDO-QUE-NAO-PODE-APARECER</p>
      </AppShell>,
    );
    expect(denied).toContain('data-nav-denied="tesouraria"');
    expect(denied).not.toContain("SALDO-QUE-NAO-PODE-APARECER");
    expect(denied).not.toContain("Tesouraria · HML sintética");
    expect(denied).toContain("Este perfil não abre esta área");
    expect(denied).toContain('tabindex="-1"');
  });

  it("tesouraria vê o caixa e não vê a secretaria", () => {
    const html = renderToStaticMarkup(
      <AppShell active="tesouraria" meta="Tesouraria" viewer={account("TESOURARIA", "caixa.demo@example.test")}>
        <p>Painel de caixa sintético</p>
      </AppShell>,
    );
    expect(html).toContain("Painel de caixa sintético");
    expect(hrefs(html)).toContain("/app/tesouraria/");
    expect(hrefs(html)).not.toContain("/app/secretaria/");
    expect(html).toContain("caixa.demo@example.test");
  });

  it("editor e publicador ficam na gestão do site", () => {
    for (const role of ["EDITOR_SITE", "PUBLICADOR_SITE"]) {
      const html = renderToStaticMarkup(
        <AppShell active="site" meta="Site" viewer={account(role)}><p>Estúdio do site</p></AppShell>,
      );
      expect(html).toContain("Estúdio do site");
      expect(hrefs(html)).toContain("/app/site/");
      expect(hrefs(html)).not.toContain("/app/editorial/");
      expect(hrefs(html)).not.toContain("/app/tesouraria/");
      const blocked = renderToStaticMarkup(
        <AppShell active="membros" meta="Pessoas" viewer={account(role)}><p>LISTA-DE-PESSOAS</p></AppShell>,
      );
      expect(blocked).not.toContain("LISTA-DE-PESSOAS");
    }
  });
});
