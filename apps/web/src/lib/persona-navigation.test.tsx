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
  canListMinistries, expectedAccessStatus, isMemberOnly, landingForRoles, ministryContextHref,
  ministrySubmenu, parseMinistryNav, personaLabel, railForRoles, shellAreasForRoles,
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
  PLATFORM_ADMIN: ["visao", "membros", "secretaria", "carteirinha", "operacao", "ministerios", "escalas", "atmosfera", "meu-espaco", "tesouraria", "acessos", "editorial", "site"],
  SECRETARIA: ["visao", "membros", "secretaria", "carteirinha", "operacao", "ministerios", "escalas", "atmosfera", "meu-espaco", "editorial", "site"],
  PASTOR: ["visao", "membros", "secretaria", "operacao", "ministerios", "escalas", "atmosfera", "meu-espaco", "editorial", "site"],
  TESOURARIA: ["visao", "operacao", "tesouraria"],
  LIDER_MINISTERIO: ["visao", "operacao", "ministerios", "escalas", "atmosfera", "meu-espaco"],
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

  it("tira operação genérica e Meu Espaço do menu administrativo e guarda a rota", () => {
    expect(isMemberOnly(["MEMBRO"])).toBe(true);
    expect(isMemberOnly(["MEMBRO", "SECRETARIA"])).toBe(false);
    expect(shellAreasForRoles(["SECRETARIA"]).map(area => area.key)).not.toContain("operacao");
    expect(shellAreasForRoles(["SECRETARIA"]).map(area => area.key)).not.toContain("meu-espaco");
    expect(shellAreasForRoles(["MEMBRO"]).map(area => area.key)).toEqual(["visao", "carteirinha", "meu-espaco"]);
    expect(areaAllowed(["SECRETARIA"], "operacao")).toBe(true);
    expect(areaAllowed(["MEMBRO"], "meu-espaco")).toBe(true);
    expect(shellAreasForRoles([], true).map(area => area.key)).not.toContain("operacao");
    expect(shellAreasForRoles([], true).map(area => area.key)).not.toContain("meu-espaco");
  });

  it("escolhe a página inicial sem conceder módulo financeiro ao líder", () => {
    expect(landingForRoles(["LIDER_MINISTERIO"])).toBe("/app/");
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

const MINISTRY_ROLES = ["PLATFORM_ADMIN", "SECRETARIA", "PASTOR", "LIDER_MINISTERIO"] as const;
const WITHOUT_MINISTRY_LIST = ["TESOURARIA", "MEMBRO", "EDITOR_SITE", "PUBLICADOR_SITE"] as const;

describe("grupo Ministérios e ferramentas", () => {
  it("lista ministérios só com o que a API devolveu, sem saldo nem nome inventado", () => {
    expect(parseMinistryNav({
      ministries: [
        { id: "m-homens", name: "Homens", slug: "homens", balance: "999,00", costCenter: "cc-1" },
        { id: "m-louvor", name: "Louvor", slug: "louvor" },
        { id: "", name: "Sem id", slug: "vazio" },
        { id: "m-louvor", name: "Louvor repetido", slug: "louvor" },
      ],
    })).toEqual([
      { id: "m-homens", name: "Homens", slug: "homens" },
      { id: "m-louvor", name: "Louvor", slug: "louvor" },
    ]);
    expect(parseMinistryNav(null)).toEqual([]);
    expect(parseMinistryNav({ ministries: "não" })).toEqual([]);
    expect(JSON.stringify(parseMinistryNav({ ministries: [{ id: "1", name: "Jovens", slug: "jovens", note: "501" }] }))).not.toContain("501");
  });

  it("abre todos os ministérios pelo identificador autorizado", () => {
    expect(ministryContextHref({ id: "m-louvor" })).toBe("/app/ministerios/?ministry=m-louvor");
    expect(ministryContextHref({ id: "m-atm" })).toBe("/app/ministerios/?ministry=m-atm");
    expect(ministryContextHref({ id: "m homens" })).toBe("/app/ministerios/?ministry=m%20homens");
  });

  it("não duplica o destino quando a API já trouxe o mesmo ministério", () => {
    const areas = areasForRoles(["LIDER_MINISTERIO"]);
    const entries = ministrySubmenu(areas, [
      { id: "m-homens", name: "Homens", slug: "homens" },
      { id: "m-louvor", name: "Louvor", slug: "louvor" },
      { id: "m-jovens", name: "Jovens", slug: "jovens" },
    ]);
    expect(entries.map(entry => entry.label)).toEqual([
      "Todos os ministérios", "Homens", "Louvor", "Jovens",
    ]);
    expect(entries.filter(entry => entry.href === "/app/ministerios/?ministry=m-louvor")).toHaveLength(1);
  });

  it.each(BUILTIN_ROLES)("decide o grupo de ministérios e o canal conforme o papel %s", role => {
    const allowed = (MINISTRY_ROLES as readonly string[]).includes(role);
    expect(canListMinistries([role])).toBe(allowed);
    const tools = railForRoles([role]).map(link => link.label);
    expect(tools).toContain("Agenda pública");
    expect(tools).not.toContain("Gestão de ministérios");
    if (role === "PASTOR" || role === "SECRETARIA" || role === "PLATFORM_ADMIN") {
      expect(tools).toContain("Canal da igreja");
    } else {
      expect(tools).not.toContain("Canal da igreja");
    }
    expect(tools).not.toContain("Evolução do sistema");
  });

  it("mantém o canal na pré-visualização e esconde da tesouraria e do membro", () => {
    expect(railForRoles([], true).map(link => link.label)).toContain("Canal da igreja");
    expect(WITHOUT_MINISTRY_LIST.every(role => canListMinistries([role]) === false)).toBe(true);
  });
});

describe("shell colapsável para os oito papéis", () => {
  const shellSource = readFileSync(join(repoRoot, "apps/web/src/components/AppShell.tsx"), "utf8");
  const shellCss = readFileSync(join(repoRoot, "apps/web/src/components/app-shell.module.css"), "utf8");

  it("recolhe com hambúrguer, gaveta e saída discreta, sem canal no menu principal", () => {
    expect(shellSource).toContain('aria-expanded={menuExpanded}');
    expect(shellSource).toContain('aria-controls="app-navigation-rail"');
    expect(shellSource).toContain('aria-label="Fechar o menu lateral"');
    expect(shellSource).toContain("Sair da sua conta?");
    expect(shellSource).toContain("data-nav-group=\"ministerios\"");
    expect(shellSource).not.toContain("CANAIS E COMUNIDADE");
    expect(shellSource).not.toContain("501");
    expect(shellSource).not.toContain("cost-center");
    expect(shellCss).toContain("data-rail=\"collapsed\"");
    expect(shellCss).toContain("data-drawer=\"open\"");
    expect(shellCss).toContain("--shell-target");
    expect(shellCss).toMatch(/@media\s*\(max-width:\s*970px\)/);
    expect(shellCss).toContain("prefers-reduced-motion");
  });

  it.each(BUILTIN_ROLES)("monta o menu de %s sem código de depuração nem centro de custo", role => {
    process.env.NEXT_PUBLIC_HML_ENABLED = "true";
    const html = renderToStaticMarkup(
      <AppShell active="visao" meta="Início" viewer={account(role, `${role.toLowerCase()}@example.test`)}>
        <p>PAINEL-{role}</p>
      </AppShell>,
    );
    expect(html).toContain(`PAINEL-${role}`);
    expect(html).toContain(`${role.toLowerCase()}@example.test`);
    expect(html.match(/>Sair</g)).toHaveLength(1);
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('data-drawer="closed"');
    expect(html).not.toContain("Ferramentas");
    expect(html).not.toContain("CANAIS E COMUNIDADE");
    expect(html).not.toContain("501");
    expect(html).not.toContain("centro de custo");
    expect(html).not.toContain("Sair da sua conta?");
    const seesMinistry = (MINISTRY_ROLES as readonly string[]).includes(role);
    if (seesMinistry) {
      expect(html).toContain('data-nav-group="ministerios"');
      expect(html).toContain("Todos os ministérios");
      expect(html).not.toContain("Meu Espaço");
      expect(html).not.toContain("/app/operacao/");
    } else {
      expect(html).not.toContain('data-nav-group="ministerios"');
      expect(html).not.toContain("/app/ministerios/");
    }
    if (role !== "TESOURARIA" && role !== "PLATFORM_ADMIN" && role !== "SECRETARIA") {
      expect(hrefs(html)).not.toContain("/app/tesouraria/");
    }
  });

  it("não escreve status técnico no vínculo quando o grupo está na página do ministério", () => {
    process.env.NEXT_PUBLIC_HML_ENABLED = "true";
    const html = renderToStaticMarkup(
      <AppShell active="ministerios" meta="Ministérios" viewer={account("LIDER_MINISTERIO")}>
        <p>EQUIPE</p>
      </AppShell>,
    );
    expect(html).toContain("EQUIPE");
    expect(html).not.toContain("501");
    expect(html).not.toContain("schema");
    expect(html).not.toContain("endpoint");
  });
});
