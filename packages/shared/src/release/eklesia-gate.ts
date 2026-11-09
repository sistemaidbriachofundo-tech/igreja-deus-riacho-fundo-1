export const HML_API_ORIGIN = "https://id-riacho1-api-hml.vercel.app";
export const PAGES_ORIGIN =
  "https://sistemaidbriachofundo-tech.github.io/igreja-deus-riacho-fundo-1";
export const HML_VERCEL_PROJECT = "id-riacho1-api-hml";
export const HML_DATABASE = "idriacho1_hml";

export const HML_PERSONAS = [
  "admin",
  "pastor",
  "secretaria",
  "tesouraria",
  "lider",
  "membro",
  "editor",
  "publicador",
] as const;

export type ReleaseStatus = "PASS" | "FAIL" | "BLOCKED";
export type PersonaId = (typeof HML_PERSONAS)[number];
export type FrontId = "A" | "B" | "C" | "D" | "E" | "F" | "G";

export interface ReleaseCheck {
  id: string;
  front: string;
  status: ReleaseStatus;
  evidence: string;
}

export interface AnonymousProbe {
  method: "GET" | "POST" | "OPTIONS";
  path: string;
  status: number | null;
  kind: "private" | "public" | "reject-login" | "cors";
  leak: boolean;
}

export interface FrontReport {
  id: FrontId;
  issue: number;
  pullRequest: number | null;
  pullState: "merged" | "open" | "absent";
  acceptance: ReleaseStatus;
  evidence: string;
}

export interface PersonaReport {
  id: PersonaId;
  status: ReleaseStatus;
  evidence: string;
}

export interface EklesiaObservation {
  expectedContractVersion: string;
  expectedSourceSha: string;
  apiHealthStatus: number | null;
  apiContractVersion: string | null;
  apiSourceSha: string | null;
  probes: AnonymousProbe[];
  pages: {
    homeStatus: number | null;
    churchName: boolean;
    demoSeed: boolean;
    publicNav: boolean;
    releaseSha: string | null;
    releasePhase: string | null;
  };
  fronts: FrontReport[];
  personas: PersonaReport[];
  ministryMembershipModel: boolean;
  ownRosterRoute: boolean;
  vercelTokenPresent: boolean;
}

export interface EklesiaVerdict {
  phase: "EM_EXECUCAO" | "CONCLUIDA";
  releaseComplete: boolean;
  checks: ReleaseCheck[];
}

export interface PagesReleaseDocument {
  channel: "github-pages" | "preview";
  sourceSha: string | null;
  phase: "EM_EXECUCAO";
  officialUrl: string;
  apiOrigin: string | null;
}

const FULL_SHA = /^[0-9a-f]{40}$/;

/** O build do Pages nunca se declara concluído. A fase só fecha no veredito do gate. */
export function pagesReleaseDocument(input: {
  eventName?: string;
  ref?: string;
  sha?: string;
}): PagesReleaseDocument {
  const sha = (input.sha ?? "").trim().toLowerCase();
  const official =
    input.eventName === "push" &&
    input.ref === "refs/heads/main" &&
    FULL_SHA.test(sha);
  return {
    channel: official ? "github-pages" : "preview",
    sourceSha: official ? sha : null,
    phase: "EM_EXECUCAO",
    officialUrl: `${PAGES_ORIGIN}/`,
    apiOrigin: official ? HML_API_ORIGIN : null,
  };
}

function probeLabel(probe: AnonymousProbe): string {
  return `${probe.method} ${probe.path} HTTP ${probe.status ?? "sem resposta"}`;
}

export function evaluateEklesiaRelease(obs: EklesiaObservation): EklesiaVerdict {
  const checks: ReleaseCheck[] = [];
  const add = (id: string, front: string, status: ReleaseStatus, evidence: string) => {
    checks.push({ id, front, status, evidence });
  };

  if (obs.pages.homeStatus === null) {
    add("pages-home", "H", "BLOCKED", "O site oficial não respondeu.");
  } else if (obs.pages.homeStatus === 200 && obs.pages.churchName && !obs.pages.demoSeed) {
    add("pages-home", "H", "PASS", "Home oficial respondeu 200, com o nome da igreja e sem título do seed demonstrativo.");
  } else {
    add(
      "pages-home",
      "H",
      "FAIL",
      `Home HTTP ${obs.pages.homeStatus}; nome da igreja=${obs.pages.churchName}; seed demonstrativo=${obs.pages.demoSeed}.`,
    );
  }

  add(
    "pages-nav",
    "H",
    obs.pages.publicNav ? "PASS" : "FAIL",
    obs.pages.publicNav
      ? "HTML público contém Início, Quem somos, Agenda e Login."
      : "A navegação pública não trouxe Início, Quem somos, Agenda e Login.",
  );

  if (obs.pages.releaseSha === null) {
    add(
      "pages-sha",
      "H",
      "BLOCKED",
      "O Pages oficial ainda não publica release.json com o SHA. O link no ar não prova este commit.",
    );
  } else if (
    obs.pages.releaseSha === obs.expectedSourceSha &&
    obs.pages.releasePhase === "EM_EXECUCAO"
  ) {
    add("pages-sha", "H", "PASS", `Pages confirma o SHA ${obs.expectedSourceSha} e mantém a fase em execução.`);
  } else {
    add(
      "pages-sha",
      "H",
      "FAIL",
      `Manifesto sourceSha=${obs.pages.releaseSha} fase=${obs.pages.releasePhase}; commit avaliado=${obs.expectedSourceSha}.`,
    );
  }

  if (obs.apiHealthStatus === null) {
    add("api-health", "H", "BLOCKED", "A API HML não respondeu em /health.");
  } else if (obs.apiHealthStatus === 200) {
    add("api-health", "H", "PASS", `${HML_API_ORIGIN}/health respondeu 200.`);
  } else {
    add("api-health", "H", "FAIL", `/health respondeu HTTP ${obs.apiHealthStatus}.`);
  }

  if (obs.apiContractVersion === null) {
    add("api-contract", "H", "BLOCKED", "GET /meta não trouxe contractVersion.");
  } else if (obs.apiContractVersion === obs.expectedContractVersion) {
    add("api-contract", "H", "PASS", `A API HML anuncia o contrato ${obs.apiContractVersion}, igual a este commit.`);
  } else {
    add(
      "api-contract",
      "H",
      "FAIL",
      `A API HML anuncia ${obs.apiContractVersion} e este commit está em ${obs.expectedContractVersion}. Push no GitHub não implantou a API.`,
    );
  }

  if (obs.apiSourceSha === null) {
    add(
      "api-sha",
      "H",
      "BLOCKED",
      "A API HML não informa sourceSha. O processo em execução é anterior a este campo, ou foi iniciado sem SOURCE_SHA e sem VERCEL_GIT_COMMIT_SHA.",
    );
  } else if (obs.apiSourceSha === obs.expectedSourceSha) {
    add("api-sha", "H", "PASS", `A API HML está no SHA ${obs.apiSourceSha}.`);
  } else {
    add(
      "api-sha",
      "H",
      "FAIL",
      `A API HML está no SHA ${obs.apiSourceSha} e o commit avaliado é ${obs.expectedSourceSha}.`,
    );
  }

  const privateProbes = obs.probes.filter((probe) => probe.kind === "private");
  if (privateProbes.length === 0 || privateProbes.some((probe) => probe.status === null)) {
    add("api-anon", "H", "BLOCKED", "A sonda anônima das rotas privadas não completou.");
  } else if (privateProbes.some((probe) => probe.leak || probe.status === 200)) {
    add("api-anon", "H", "FAIL", "Uma rota privada respondeu 200 sem sessão.");
  } else if (privateProbes.some((probe) => probe.status !== 401 && probe.status !== 404)) {
    add(
      "api-anon",
      "H",
      "FAIL",
      privateProbes.filter((probe) => probe.status !== 401).map(probeLabel).join("; "),
    );
  } else {
    const guarded = privateProbes.filter((probe) => probe.status === 401);
    if (guarded.length === 0) {
      add("api-anon", "H", "BLOCKED", "Nenhuma rota privada respondeu 401; a guarda de sessão não foi observada.");
    } else {
      add("api-anon", "H", "PASS", `${guarded.length} rotas privadas recusaram a sessão ausente com 401.`);
    }
  }

  const missing = privateProbes.filter((probe) => probe.status === 404);
  if (missing.length > 0) {
    add(
      "api-route-coverage",
      "H",
      "BLOCKED",
      `Rotas deste commit ainda ausentes na API implantada: ${missing.map(probeLabel).join("; ")}.`,
    );
  } else if (privateProbes.length > 0 && privateProbes.every((probe) => probe.status === 401)) {
    add("api-route-coverage", "H", "PASS", "As rotas privadas sondadas existem na API HML e exigem sessão.");
  } else if (privateProbes.length === 0) {
    add("api-route-coverage", "H", "BLOCKED", "Sem rotas privadas na sonda.");
  }

  const publics = obs.probes.filter((probe) => probe.kind === "public");
  if (publics.length === 0 || publics.some((probe) => probe.status === null)) {
    add("api-public", "H", "BLOCKED", "A leitura pública da API não completou.");
  } else if (publics.some((probe) => probe.leak)) {
    add("api-public", "H", "FAIL", "O JSON público contém campo de segredo (senha, token, CPF ou nota pastoral).");
  } else if (publics.every((probe) => probe.status === 200)) {
    add("api-public", "H", "PASS", "Leituras públicas responderam 200 sem campo de segredo.");
  } else {
    add("api-public", "H", "FAIL", publics.map(probeLabel).join("; "));
  }

  const login = obs.probes.find((probe) => probe.kind === "reject-login");
  if (!login || login.status === null) {
    add("api-login-empty", "H", "BLOCKED", "POST /auth/login sem corpo útil não foi sondado.");
  } else if (login.status === 200 || login.status === 201) {
    add("api-login-empty", "H", "FAIL", "Login sem credencial foi aceito.");
  } else if (login.status === 400 || login.status === 401 || login.status === 422) {
    add("api-login-empty", "H", "PASS", `Login sem credencial foi recusado com HTTP ${login.status}.`);
  } else {
    add("api-login-empty", "H", "FAIL", `Login sem credencial respondeu HTTP ${login.status}.`);
  }

  const cors = obs.probes.find((probe) => probe.kind === "cors");
  if (!cors || cors.status === null) {
    add("api-cors", "H", "BLOCKED", "O preflight CORS da origem oficial não respondeu.");
  } else if (cors.status >= 200 && cors.status < 300 && !cors.leak) {
    add("api-cors", "H", "PASS", "O CORS autoriza a origem do GitHub Pages e não reflete origem arbitrária.");
  } else {
    add("api-cors", "H", "FAIL", `Preflight CORS HTTP ${cors.status}; origem indevida=${cors.leak}.`);
  }

  if (obs.apiSourceSha !== null && obs.apiSourceSha === obs.expectedSourceSha) {
    add(
      "api-deploy",
      "H",
      "PASS",
      `Deploy confirmado pelo sourceSha. Projeto ${HML_VERCEL_PROJECT}, banco ${HML_DATABASE}.`,
    );
  } else if (!obs.vercelTokenPresent) {
    add(
      "api-deploy",
      "H",
      "BLOCKED",
      `VERCEL_TOKEN ausente. Não há permissão para implantar ${HML_VERCEL_PROJECT} nem para migrar o Neon ${HML_DATABASE}. Nenhuma base de produção foi alterada.`,
    );
  } else {
    add(
      "api-deploy",
      "H",
      "BLOCKED",
      "Há token de deploy, e o SHA observado na API ainda não é o commit avaliado. Este gate não publica sozinho.",
    );
  }

  add(
    "schema-ministry",
    "B",
    obs.ministryMembershipModel ? "PASS" : "BLOCKED",
    obs.ministryMembershipModel
      ? "schema.prisma contém MinistryMembership."
      : "schema.prisma não tem MinistryMembership. O vínculo formal segue sem tabela; a frente B ainda não pactuou a migration. Nenhuma tabela foi inventada aqui.",
  );

  add(
    "own-roster",
    "C",
    obs.ownRosterRoute ? "PASS" : "BLOCKED",
    obs.ownRosterRoute
      ? "Existe rota da escala da própria sessão."
      : "Não há rota GET da escala da própria sessão. Meu Espaço continua sem a lista pessoal. A frente C é quem entrega esse contrato.",
  );

  if (obs.fronts.length < 7) {
    add("fronts-present", "H", "BLOCKED", "O relato das frentes A–G não veio completo.");
  }
  for (const front of obs.fronts) {
    add(`front-${front.id}`, front.id, front.acceptance, front.evidence);
  }

  if (obs.personas.length !== HML_PERSONAS.length) {
    add("personas-present", "G", "BLOCKED", "A matriz não cobre as oito personas sintéticas.");
  }
  for (const persona of obs.personas) {
    add(`persona-${persona.id}`, "G", persona.status, persona.evidence);
  }

  const releaseComplete = checks.length > 0 && checks.every((check) => check.status === "PASS");
  return {
    phase: releaseComplete ? "CONCLUIDA" : "EM_EXECUCAO",
    releaseComplete,
    checks,
  };
}
