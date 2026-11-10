import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const repoRoot = join(here, "..", "..", "..");

const BASELINE = "6c43aea96ad3fe24ec1ed2c09f717963fb289c62";

function read(path) {
  return readFileSync(join(repoRoot, path), "utf8");
}

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const info = statSync(full);
    if (info.isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

function routeFromPage(file) {
  const rel = relative(join(repoRoot, "apps/web/src/app"), file).replaceAll("\\", "/");
  const without = rel.replace(/\/page\.tsx$/, "").replace(/^page\.tsx$/, "");
  if (!without) return "/";
  return `/${without}/`;
}

function classifyRoute(route, source) {
  if (route === "/w1-estudio/") {
    return { classification: "EDITOR_SIMULADO", note: "Estúdio com papel e publicação simulados, publicado no Pages oficial." };
  }
  if (route === "/design-system/") {
    return { classification: "FERRAMENTA_ENGENHARIA", note: "Vitrine do kit visual, fora do roteiro público Início / Quem somos / Agenda." };
  }
  if (route === "/status/") {
    return { classification: "FERRAMENTA_ENGENHARIA", note: "Página de bootstrap com checklist de CI, Sonar e localhost." };
  }
  if (route === "/app/demo/") {
    return { classification: "ROTA_RETIRADA", note: "A página avisa que o cadastro local foi retirado, mas a URL continua publicada." };
  }
  if (route === "/app/operacao/") {
    return { classification: "SUPERFICIE_REJEITADA", note: "Rótulo e módulo genérico Ministérios e operação / DAS, com fases F2–F6." };
  }
  if (route === "/app/editorial/") {
    return { classification: "ROTA_AUTENTICADA", note: "Estúdio real de conteúdo. O título ainda usa Church OS." };
  }
  if (route === "/app/site/") {
    return { classification: "ROTA_AUTENTICADA", note: "Gestão do site. Conserva o assistente editorial interno." };
  }
  if (route.startsWith("/app/")) {
    return { classification: "ROTA_AUTENTICADA", note: "Área interna. O build de main usa o ramo HML quando a flag está ligada." };
  }
  if (["/", "/a-igreja/", "/eventos/", "/login/"].includes(route)) {
    return { classification: "ROTA_PUBLICA_DO_ROTEIRO", note: "Permanece no menu ou no acesso. A diretriz pede Início, Quem somos e Agenda na mesma página." };
  }
  if (source.includes("RiachinhoPublicChat") || source.includes("PublicPage")) {
    return { classification: "ROTA_PUBLICA_FORA_DO_ROTEIRO", note: "Página pública além do trio Início / Quem somos / Agenda." };
  }
  return { classification: "ROTA_PUBLICA_FORA_DO_ROTEIRO", note: "Rota publicada fora do recorte do áudio." };
}

function productionSources() {
  const root = join(repoRoot, "apps/web/src");
  return walk(root).filter((file) => /\.(tsx|ts)$/.test(file) && !/\.test\./.test(file) && !/\.spec\./.test(file));
}

export function scanInventory() {
  const pages = walk(join(repoRoot, "apps/web/src/app")).filter((file) => file.endsWith("/page.tsx") || file.endsWith("\\page.tsx"));
  const routes = pages.map((file) => {
    const rel = relative(repoRoot, file).replaceAll("\\", "/");
    const source = readFileSync(file, "utf8");
    const route = routeFromPage(file);
    return { route, file: rel, ...classifyRoute(route, source) };
  }).sort((a, b) => a.route.localeCompare(b.route));

  const nav = read("apps/web/src/lib/persona-navigation.ts");
  const shell = read("apps/web/src/components/AppShell.tsx");
  const portal = read("apps/web/src/components/PublicPortal.tsx");
  const hml = read("apps/web/src/components/HmlPhaseOne.tsx");
  const membersPage = read("apps/web/src/app/app/membros/page.tsx");
  const secretaryPage = read("apps/web/src/app/app/secretaria/page.tsx");
  const overviewPage = read("apps/web/src/app/app/page.tsx");
  const studio = read("apps/web/src/w1-portal/W1PortalStudio.tsx");
  const siteManager = read("apps/web/src/components/SiteManager.tsx");
  const records = read("apps/web/src/lib/use-church-records.ts");
  const editorialPage = read("apps/web/src/app/app/editorial/page.tsx");
  const das = read("apps/web/src/components/DasOperations.tsx");
  const ci = read(".github/workflows/ci.yml");
  const own = nav.match(/const OWN_ASSIGNMENT = \[([^\]]+)\]/);

  const flags = {
    baseline: BASELINE,
    publicAiMounted: portal.includes("RiachinhoPublicChat"),
    publicAiEnabledOnMain: /NEXT_PUBLIC_RIACHINHO_PUBLIC_ENABLED: \$\{\{ github\.event_name == 'push' && github\.ref == 'refs\/heads\/main' && 'true'/.test(ci),
    hmlEnabledOnMain: /NEXT_PUBLIC_HML_ENABLED: \$\{\{ github\.event_name == 'push' && github\.ref == 'refs\/heads\/main' && 'true'/.test(ci),
    simulatedRole: studio.includes("Papel simulado"),
    simulatedPublish: studio.includes("Publicar simulado"),
    individualAccessCopy: read("apps/web/src/components/LoginScreen.tsx").includes("Seu acesso é individual."),
    operationLabel: nav.includes('label: "Ministérios e operação"'),
    meuEspacoInAdminMenu: Boolean(own && own[1].includes("PLATFORM_ADMIN") && /key: "meu-espaco"[\s\S]{0,500}roles: OWN_ASSIGNMENT/.test(nav)),
    churchOsRibbon: nav.includes("CHURCH OS") || shell.includes("CHURCH OS"),
    editorialTitleChurchOs: editorialPage.includes("Church OS"),
    hmlCombinedCta: hml.includes("Cadastrar e iniciar admissão"),
    hmlSeparateCtas: hml.includes(">Cadastrar pessoa<") && hml.includes("Iniciar admissão"),
    membersUsesHmlBranch: membersPage.includes('process.env.NEXT_PUBLIC_HML_ENABLED === "true"') && membersPage.includes("HmlPhaseOne"),
    secretaryUsesHmlBranch: secretaryPage.includes("HmlPhaseOne") && secretaryPage.includes("ChurchSecretary"),
    overviewUsesPersonaHome: overviewPage.includes("PersonaHome") && overviewPage.includes("ChurchDashboard"),
    localStorageFallback: records.includes("localStorage"),
    dasPhases: das.includes("module.phase") && das.includes("Integração HML"),
    internalAssistant: siteManager.includes("ViviEditorialAssistant"),
    singleLogoutTrigger: shell.includes('className={s.logoutTrigger}') && shell.includes(">Sair<"),
    searchControl: shell.includes("Pesquisar e navegar"),
    alertsControl: shell.includes("Ir para avisos no painel"),
    collapsed409: hml.includes("if (/\\(409\\)|409/.test(error.message))"),
  };

  const sources = productionSources();
  const watched = [
    ["apps/web/src/components/RiachinhoPublicChat.tsx", "ASSISTENTE_PUBLICO"],
    ["apps/web/src/components/ViviEditorialAssistant.tsx", "ASSISTENTE_INTERNO"],
    ["apps/web/src/w1-portal/W1PortalStudio.tsx", "EDITOR_SIMULADO"],
    ["apps/web/src/components/MemberDirectory.tsx", "FALLBACK_LOCAL"],
    ["apps/web/src/components/ChurchSecretary.tsx", "FALLBACK_LOCAL"],
    ["apps/web/src/components/ChurchDashboard.tsx", "FALLBACK_LOCAL"],
    ["apps/web/src/components/DasOperations.tsx", "SUPERFICIE_REJEITADA"],
    ["apps/web/src/components/HmlPhaseOne.tsx", "ATIVA_NO_BUILD_HML"],
    ["apps/web/src/components/PersonaHome.tsx", "ATIVA_NO_BUILD_HML"],
    ["apps/web/src/components/EditorialStudio.tsx", "ROTA_AUTENTICADA"],
    ["apps/web/src/components/SiteManager.tsx", "ROTA_AUTENTICADA"],
    ["apps/web/src/lib/use-church-records.ts", "FALLBACK_LOCAL"],
  ];
  const components = watched.map(([file, classification]) => {
    const name = file.split("/").pop().replace(/\.tsx?$/, "");
    const importPattern = new RegExp(`from\\s+["'][^"']*${name}["']`);
    const importers = sources
      .map((source) => relative(repoRoot, source).replaceAll("\\", "/"))
      .filter((source) => source !== file && importPattern.test(read(source)));
    return { file, classification, importers };
  });

  const scripts = [
    {
      file: "apps/web/scripts/synthetic-auth-stub.mjs",
      classification: "FERRAMENTA_LOCAL",
      note: "Servidor de QA em loopback. Não é rota do Pages.",
    },
    {
      file: "apps/web/scripts/synthetic-auth-policy.mjs",
      classification: "FERRAMENTA_LOCAL",
      note: "Política do stub local. Não entra no site publicado.",
    },
    {
      file: "apps/web/scripts/verify-export.mjs",
      classification: "ATIVO_BUILD",
      note: "Conferência do export estático. Não remover junto com o código morto.",
    },
    {
      file: ".github/workflows/ci.yml",
      classification: "FLAG_DE_BUILD",
      note: "No push da main liga o chat público e o modo HML. Fora do ownership desta frente.",
    },
  ];

  return { baseline: BASELINE, routes, flags, components, scripts };
}
