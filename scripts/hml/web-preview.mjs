/**
 * Prévia protegida do projeto Vercel id-riacho1-web-hml.
 * Funções puras: não chamam a rede, não leem segredo e não alteram projeto remoto.
 */

export const WEB_HML_PROJECT = "id-riacho1-web-hml";
export const WEB_HML_PROJECT_ID = "prj_apLd6QGDRLNUBWF6BsFAI7s72Uai";
export const WEB_HML_TEAM_ID = "team_CMNbcFRquQfcR2yWEO7UbsOS";
export const WEB_HML_BLOCKED_DEPLOYMENT = "dpl_J3zExHhufmJ8DtwZQiKvmVLnn8ju";
export const WEB_HML_BASELINE_SHA = "6c43aea96ad3fe24ec1ed2c09f717963fb289c62";
export const WEB_PREVIEW_BRANCH = "previa/rf1-v1";
export const WEB_HML_ALIAS = "https://id-riacho1-web-hml.vercel.app/";
export const PAGES_ORIGIN = "https://sistemaidbriachofundo-tech.github.io/igreja-deus-riacho-fundo-1";
export const HML_API_ORIGIN = "https://id-riacho1-api-hml.vercel.app";

/** Fatos lidos na API do GitHub em 2026-11-10. O repositório é público. */
export const BASELINE_GIT = {
  sha: WEB_HML_BASELINE_SHA,
  authorLogin: "sistemaidbriachofundo-tech",
  authorId: 352435434,
  authorEmail: "sistemaidbriachofundo@gmail.com",
  committerLogin: "web-flow",
  committerEmail: "noreply@github.com",
  repository: "sistemaidbriachofundo-tech/igreja-deus-riacho-fundo-1",
  visibility: "public",
  subject: "Merge pull request #167 from sistemaidbriachofundo-tech/integracao/revitalizacao-v3-20261110",
};

const FULL_SHA = /^[0-9a-f]{40}$/;

export const WAVE_PLAN = {
  epic: 144,
  integratorIssue: 172,
  baseSha: WEB_HML_BASELINE_SHA,
  mergeToMain: false,
  previewBranch: WEB_PREVIEW_BRANCH,
  createPreviewBranchNow: false,
  fronts: [
    {
      issue: 169,
      name: "portal-publico",
      owns: [
        "apps/web/src/app/page.tsx",
        "apps/web/src/app/a-igreja/page.tsx",
        "apps/web/src/app/eventos/page.tsx",
        "apps/web/src/app/login/page.tsx",
        "apps/web/src/components/LoginScreen.tsx",
        "apps/web/src/components/login-screen.module.css",
        "apps/web/src/components/RiachinhoPublicChat.tsx",
      ],
    },
    {
      issue: 170,
      name: "admin-shell",
      owns: [
        "apps/web/src/components/AppShell.tsx",
        "apps/web/src/components/app-shell.module.css",
        "apps/web/src/components/PersonaHome.tsx",
        "apps/web/src/components/persona-home.module.css",
        "apps/web/src/components/ChurchDashboard.tsx",
        "apps/web/src/components/church-dashboard.module.css",
      ],
    },
    {
      issue: 171,
      name: "qa",
      owns: ["qa/", "docs/qa/"],
    },
  ],
  integratorOwns: [
    "scripts/hml/web-preview.mjs",
    "scripts/hml/web-preview-build.sh",
    "scripts/hml/web-preview-diagnose.mjs",
    "scripts/hml/web-preview-write-release.mjs",
    "deploy/hml/web-preview.project.json",
    "docs/revitalizacao-144/previa-web-hml.md",
    "apps/web/next.config.ts",
    "apps/web/src/lib/paths.ts",
    "apps/web/src/lib/persona-navigation.ts",
    ".github/workflows/ci.yml",
  ],
  doNotMerge: [156, 157, 158, 159, 160, 162, 163, 164, 165, 166, 167, 168],
};

export function webPreviewReleaseDocument(sha) {
  const sourceSha = String(sha ?? "").trim().toLowerCase();
  if (!FULL_SHA.test(sourceSha)) {
    throw new Error("A prévia web exige o SHA completo do commit construído");
  }
  return {
    channel: "vercel-hml",
    sourceSha,
    phase: "EM_EXECUCAO",
    ready: false,
    project: WEB_HML_PROJECT,
    protection: "sso-all-deployments",
    basePath: "",
    apiOrigin: null,
    apiBinding: "unset",
    officialUrl: `${PAGES_ORIGIN}/`,
  };
}

export function acceptExportedRelease(release, env = {}) {
  const reasons = [];
  if (!release || typeof release !== "object") {
    return { ok: false, reasons: ["release.json inválido"] };
  }
  if (release.phase !== "EM_EXECUCAO") {
    reasons.push("release.json não pode declarar a fase concluída");
  }
  const preview = env.previewChannel === "vercel-hml";
  const official = env.eventName === "push" && env.ref === "refs/heads/main";
  if (preview && official) {
    reasons.push("A prévia Vercel não pode ser o push oficial da main");
  } else if (preview) {
    if (release.channel !== "vercel-hml") reasons.push("channel da prévia web HML incorreto");
    if (release.ready !== false) reasons.push("release.json não pode marcar a prévia como pronta");
    if (release.project !== WEB_HML_PROJECT) reasons.push("projeto da prévia não é id-riacho1-web-hml");
    if (release.basePath !== "") reasons.push("NEXT_PUBLIC_BASE_PATH da prévia tem de ser vazio");
    if (release.protection !== "sso-all-deployments") reasons.push("a prévia não pode desligar o SSO");
    if (release.apiOrigin !== null || release.apiBinding !== "unset") {
      reasons.push("a prévia não aponta API nem banco");
    }
    if (!FULL_SHA.test(String(release.sourceSha ?? ""))) {
      reasons.push("sourceSha da prévia ausente");
    } else if (FULL_SHA.test(String(env.sha ?? "").trim().toLowerCase()) && release.sourceSha !== String(env.sha).trim().toLowerCase()) {
      reasons.push("sourceSha da prévia não é o commit construído");
    }
  } else if (official) {
    if (release.channel !== "github-pages") reasons.push("channel do Pages oficial incorreto");
    if (release.sourceSha !== env.sha) reasons.push("sourceSha do Pages não é o SHA do workflow");
  } else if (release.sourceSha !== null) {
    reasons.push("Build fora do push da main não pode carimbar sourceSha oficial");
  }
  return { ok: reasons.length === 0, reasons };
}

export function validateWebPreviewProject(project) {
  const reasons = [];
  const expect = (ok, reason) => {
    if (!ok) reasons.push(reason);
  };
  expect(project?.schema === "idbrf.web-preview/v1", "schema da prévia web ausente");
  expect(project?.apply === false, "o arquivo de prévia não pode se aplicar sozinho");
  expect(project?.projectName === WEB_HML_PROJECT, "projectName não é id-riacho1-web-hml");
  expect(project?.projectId === WEB_HML_PROJECT_ID, "projectId divergente");
  expect(project?.teamId === WEB_HML_TEAM_ID, "teamId divergente");
  expect(project?.blockedDeploymentId === WEB_HML_BLOCKED_DEPLOYMENT, "deployment bloqueado divergente");
  expect(project?.baselineSha === WEB_HML_BASELINE_SHA, "baseline divergente");
  expect(project?.ssoProtection === "all-deployments", "SSO tem de permanecer em todos os deployments");
  expect(project?.rootDirectory === "", "a raiz do monorepo tem de ser o repositório");
  expect(project?.installCommand === "npm ci", "installCommand divergente");
  expect(project?.buildCommand === "bash scripts/hml/web-preview-build.sh", "buildCommand divergente");
  expect(project?.outputDirectory === "apps/web/out", "outputDirectory divergente");
  expect(project?.productionDeploy === false, "a prévia não publica produção");
  expect(project?.previewBranch === WEB_PREVIEW_BRANCH, "branch de prévia divergente");
  expect(project?.env?.scope === "preview", "env fora do escopo preview");
  expect(project?.env?.NEXT_PUBLIC_BASE_PATH === "", "NEXT_PUBLIC_BASE_PATH tem de ser vazio");
  expect(project?.env?.NEXT_PUBLIC_HML_ENABLED === "true", "HML da prévia desligada");
  expect(project?.env?.NEXT_PUBLIC_RIACHINHO_PUBLIC_ENABLED === "false", "IA pública não entra na prévia");
  expect(project?.env?.NEXT_PUBLIC_PORTAL_LIVE_ENABLED === "false", "portal ao vivo não entra na prévia");
  expect(project?.env?.NEXT_PUBLIC_API_URL === null, "API da prévia tem de nascer desligada");
  const forbidden = new Set(project?.forbidden ?? []);
  for (const item of ["seed", "prisma migrate", "github-pages", "api-project-mutation", "disable-sso", "secret-changes"]) {
    expect(forbidden.has(item), `proibição ausente: ${item}`);
  }
  expect(!Object.keys(project?.env ?? {}).some((key) => /SECRET|TOKEN|DATABASE|JWT|PASSWORD/i.test(key)), "env da prévia não carrega segredo");
  return { ok: reasons.length === 0, reasons };
}

function blockedCause(message) {
  const text = String(message ?? "");
  if (/author|contribut|hobby|git commit/i.test(text)) return "git-author-hobby";
  if (/spend|billing|paused|quota|fair use|terms/i.test(text)) return "spend-or-account";
  if (text.trim()) return "blocked-unparsed";
  return null;
}

export function diagnoseWebPreview(input) {
  const findings = [];
  const alias = input.alias ?? null;
  const deployment = input.deployment ?? { available: false, missingToken: true };
  const ssoChallenge = Boolean(alias?.ssoChallenge) || alias?.httpStatus === 401;

  if (ssoChallenge) {
    findings.push({
      id: "alias-sso",
      status: "PASS",
      evidence: "O alias respondeu desafio de autenticação. Isso confirma proteção, não libera a prévia.",
    });
  } else if (alias?.httpStatus === 503 && alias?.vercelError === "DEPLOYMENT_PAUSED") {
    findings.push({
      id: "alias-paused",
      status: "BLOCKED",
      evidence: `${WEB_HML_ALIAS} respondeu HTTP 503 com x-vercel-error=DEPLOYMENT_PAUSED. Não houve desafio SSO (401).`,
    });
  } else if (alias == null) {
    findings.push({
      id: "alias-unread",
      status: "BLOCKED",
      evidence: "O alias público não foi lido nesta execução.",
    });
  } else {
    findings.push({
      id: "alias-other",
      status: "BLOCKED",
      evidence: `O alias respondeu HTTP ${alias.httpStatus ?? "sem resposta"} com x-vercel-error=${alias.vercelError ?? "ausente"}.`,
    });
  }

  if (input.apiHealthStatus === 200) {
    findings.push({
      id: "api-hml-up",
      status: "PASS",
      evidence: `${HML_API_ORIGIN}/health respondeu 200 no mesmo intervalo. A pausa não é uma queda geral da Vercel nem da API HML.`,
    });
  } else if (input.apiHealthStatus == null) {
    findings.push({
      id: "api-hml-unread",
      status: "BLOCKED",
      evidence: "GET /health da API HML não foi lido nesta execução.",
    });
  } else {
    findings.push({
      id: "api-hml-up",
      status: "FAIL",
      evidence: `GET /health da API HML respondeu HTTP ${input.apiHealthStatus}.`,
    });
  }

  let deploymentCause = null;
  if (!deployment.available) {
    const http = deployment.httpStatus == null ? "sem chamada autenticada" : `HTTP ${deployment.httpStatus}`;
    findings.push({
      id: "deployment-unread",
      status: "BLOCKED",
      evidence: deployment.missingToken
        ? `GET /v13/deployments/${WEB_HML_BLOCKED_DEPLOYMENT} (${http}) não devolveu o deployment. O errorMessage segue indisponível para o time ${WEB_HML_TEAM_ID}.`
        : `A leitura do deployment ${WEB_HML_BLOCKED_DEPLOYMENT} não ficou disponível (${http}).`,
    });
  } else {
    deploymentCause = deployment.readyState === "BLOCKED" ? blockedCause(deployment.errorMessage) : null;
    const logs = deployment.buildLogCount;
    findings.push({
      id: "deployment-state",
      status: deployment.readyState === "READY" ? "FAIL" : "BLOCKED",
      evidence: `readyState=${deployment.readyState ?? "ausente"} errorCode=${deployment.errorCode ?? "ausente"} buildLogs=${logs ?? "ausente"} errorMessage=${deployment.errorMessage ?? "ausente"}.`,
    });
    if (deployment.readyState === "BLOCKED" && logs === 0) {
      findings.push({
        id: "no-build-logs",
        status: "BLOCKED",
        evidence: "O deployment não tem logs de build. A recusa aconteceu antes do builder.",
      });
    }
  }

  const git = input.git ?? BASELINE_GIT;
  findings.push({
    id: "git-author",
    status: "PASS",
    evidence: `O commit ${git.sha} é de ${git.authorLogin} <${git.authorEmail}> (GitHub id ${git.authorId}); o committer é ${git.committerLogin}. Repositório ${git.visibility}. A doc da Vercel para Hobby exige que o autor do commit seja o dono do time, conferido em Login Connections.`,
  });

  const humanControls = [
    {
      id: "read-deployment",
      actor: `conta membro do time ${WEB_HML_TEAM_ID}`,
      action: `Abrir o projeto ${WEB_HML_PROJECT} (${WEB_HML_PROJECT_ID}) e o deployment ${WEB_HML_BLOCKED_DEPLOYMENT}. Copiar readyState, errorCode, errorMessage, quantidade de linhas de build, repositório Git conectado, Production Branch e o estado de Vercel Authentication. Não alterar nenhum desses controles nesta leitura.`,
    },
    {
      id: "act-on-message",
      actor: "dono do time Vercel, depois da leitura",
      action: deploymentCause === "git-author-hobby"
        ? `A mensagem lida aponta autor Git no plano Hobby. Confirmar que Login Connections do dono é o GitHub ${git.authorLogin} (id ${git.authorId}) e que ${git.authorEmail} está na conta. Não convidar cursoragent@cursor.com, não mudar o plano e não desligar a verificação de autor.`
        : deploymentCause === "spend-or-account"
          ? "A mensagem lida aponta gasto, cota ou pausa da conta. O dono trata isso no Spend Management e no e-mail da Vercel. O repositório não corrige a pausa."
          : "Se a mensagem for autor Git no Hobby, conferir Login Connections do dono com o GitHub sistemaidbriachofundo-tech e o e-mail sistemaidbriachofundo@gmail.com, sem convidar outros autores. Se a mensagem for gasto, cota ou pausa, tratar só no painel e no e-mail da Vercel. Se o Git conectado não for sistemaidbriachofundo-tech/igreja-deus-riacho-fundo-1, parar e confirmar antes de reconectar.",
    },
    {
      id: "apply-web-project-settings",
      actor: "dono do time, somente no projeto web",
      action: "Aplicar à mão os campos de deploy/hml/web-preview.project.json no projeto id-riacho1-web-hml. O arquivo está com apply=false. Não aplicar no projeto id-riacho1-api-hml, não criar deployment e não promover a branch main.",
    },
    {
      id: "cors-later",
      actor: "dono do time, só após URL READY e decisão explícita",
      action: "A prévia nasce com NEXT_PUBLIC_API_URL vazio. Só se a prévia for autorizada a falar com a API sintética, acrescentar a origem HTTPS exata dessa prévia em CORS_ORIGIN de id-riacho1-api-hml. Não fazer isso agora.",
    },
  ];

  return {
    previewReady: false,
    ssoAction: "preserve",
    deploymentId: WEB_HML_BLOCKED_DEPLOYMENT,
    projectId: WEB_HML_PROJECT_ID,
    teamId: WEB_HML_TEAM_ID,
    baselineSha: WEB_HML_BASELINE_SHA,
    causeFromDeploymentMessage: deploymentCause,
    messageStillRequired: !deployment.available || deploymentCause == null,
    findings,
    humanControls,
    forbidden: ["disable-sso", "change-permissions", "change-secrets", "official-deploy", "merge-main", "seed", "migrate"],
  };
}

export function wavePlanConflicts(plan = WAVE_PLAN) {
  const reasons = [];
  if (plan.mergeToMain !== false) reasons.push("a onda não entra na main");
  if (plan.createPreviewBranchNow !== false) reasons.push("a branch de prévia não pode nascer neste passo");
  if (plan.baseSha !== WEB_HML_BASELINE_SHA) reasons.push("baseline divergente");
  if (plan.previewBranch !== WEB_PREVIEW_BRANCH) reasons.push("branch de prévia divergente");
  const owned = new Map();
  for (const front of plan.fronts) {
    for (const path of front.owns) {
      const previous = owned.get(path);
      if (previous) reasons.push(`${path} pertence a #${previous} e #${front.issue}`);
      owned.set(path, front.issue);
    }
  }
  const front169 = plan.fronts.find((front) => front.issue === 169);
  const front170 = plan.fronts.find((front) => front.issue === 170);
  const front171 = plan.fronts.find((front) => front.issue === 171);
  if (!front169 || !front170 || !front171) reasons.push("frentes 169, 170 e 171 ausentes");
  if (front169?.owns.some((path) => path.includes("AppShell") || path.includes("PersonaHome") || path.includes("ChurchDashboard"))) {
    reasons.push("a frente 169 não edita o shell admin");
  }
  if (front170?.owns.some((path) => path.includes("LoginScreen") || path.startsWith("apps/web/src/app/page"))) {
    reasons.push("a frente 170 não edita o portal nem o login");
  }
  if (front171?.owns.some((path) => path.startsWith("apps/") || path.startsWith("packages/"))) {
    reasons.push("a frente 171 não edita aplicação");
  }
  for (const reserved of plan.integratorOwns) {
    for (const [path, issue] of owned) {
      if (path === reserved || reserved.startsWith(path)) reasons.push(`#${issue} invade arquivo do integrador ${reserved}`);
    }
  }
  for (const pull of [167, 168]) {
    if (!plan.doNotMerge.includes(pull)) reasons.push(`PR #${pull} não pode ser reintegrado`);
  }
  return { ok: reasons.length === 0, reasons };
}
