/**
 * Guarda fail-closed da massa de QA.
 * O nome idriacho1_hml também existe em HML. Só o ramo Neon br-twilight-bonus-b6moawk7
 * do projeto flat-tree-17047178 autoriza gravação. A URL não é impressa.
 */

export const QA_PROJECT = "flat-tree-17047178";
export const QA_BRANCH = "br-twilight-bonus-b6moawk7";
export const QA_DATABASE = "idriacho1_hml";
export const QA_API_ORIGIN = "https://id-riacho1-api-qa.vercel.app";
export const CI_DATABASE = "idriacho1_ci";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const BLOCKED_STAGES = new Set(["production", "prod", "hml", "homolog", "homologacao", "homologação"]);
const BLOCKED_HOST_MARKERS = ["ep-misty-silence", "b6n7k8ez"];

export class SeedGuardError extends Error {
  constructor(message) {
    super(message);
    this.name = "SeedGuardError";
    this.exitCode = 2;
  }
}

export function parseDatabaseTarget(databaseUrl) {
  let url;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new SeedGuardError("BLOQUEADO: DATABASE_URL inválida");
  }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new SeedGuardError("BLOQUEADO: a conexão precisa ser PostgreSQL");
  }
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!databaseName || databaseName.includes("/")) {
    throw new SeedGuardError("BLOQUEADO: database_name ausente na URL");
  }
  return {
    databaseName,
    host: url.hostname.toLowerCase(),
    raw: databaseUrl,
    sslmode: url.searchParams.get("sslmode"),
  };
}

function isNeonHost(host) {
  return host === "neon.tech" || host.endsWith(".neon.tech");
}

function stageOf(env) {
  return String(env.IDBRF_RUNTIME_STAGE ?? "").trim().toLowerCase();
}

/**
 * @param {{ databaseUrl?: string, mode: "dry-run" | "apply" | "report", env?: NodeJS.ProcessEnv }} input
 */
export function assertSeedTarget(input) {
  const mode = input.mode;
  const env = input.env ?? {};
  const stage = stageOf(env);
  if (BLOCKED_STAGES.has(stage)) {
    throw new SeedGuardError("BLOQUEADO: estágio de execução é HML ou produção");
  }
  if (env.HML_PUBLIC_API_URL?.trim()) {
    throw new SeedGuardError("BLOQUEADO: HML_PUBLIC_API_URL indica publicação de homologação");
  }
  if (env.VERCEL === "1") {
    throw new SeedGuardError("BLOQUEADO: esta seed não roda dentro do build da Vercel");
  }

  const databaseUrl = input.databaseUrl?.trim();
  if (!databaseUrl) {
    if (mode === "apply") {
      throw new SeedGuardError("BLOQUEADO: --apply exige DATABASE_URL do ramo QA. Nenhum banco foi contactado.");
    }
    return { ok: true, persisted: false, offline: true, databaseName: null, place: "offline" };
  }

  const target = parseDatabaseTarget(databaseUrl);
  if (BLOCKED_HOST_MARKERS.some((marker) => target.host.includes(marker))) {
    throw new SeedGuardError("BLOQUEADO: endpoint de outro ambiente. Nenhum banco foi contactado.");
  }
  if (isNeonHost(target.host)) {
    if (target.databaseName !== QA_DATABASE) {
      throw new SeedGuardError("BLOQUEADO: host Neon com database_name diferente de idriacho1_hml");
    }
    if (!target.host.includes(QA_BRANCH)) {
      throw new SeedGuardError("BLOQUEADO: o host não identifica o ramo QA. Nenhum banco foi contactado.");
    }
    if (!["require", "verify-full"].includes(target.sslmode ?? "")) {
      throw new SeedGuardError("BLOQUEADO: Neon QA exige sslmode=require ou verify-full");
    }
    if (env.QA_SEED_CONFIRM !== QA_BRANCH || env.QA_SEED_PROJECT !== QA_PROJECT) {
      throw new SeedGuardError(
        "BLOQUEADO: Neon QA exige QA_SEED_CONFIRM=br-twilight-bonus-b6moawk7 e QA_SEED_PROJECT=flat-tree-17047178",
      );
    }
    if (stage !== "qa" && stage !== "non-production") {
      throw new SeedGuardError("BLOQUEADO: IDBRF_RUNTIME_STAGE precisa ser qa ou non-production");
    }
    if (mode === "apply" && env.QA_SEED_OPERATOR !== "qa-dev") {
      throw new SeedGuardError("BLOQUEADO: --apply no Neon exige QA_SEED_OPERATOR=qa-dev depois da confirmação do ramo");
    }
    return {
      ok: true,
      persisted: mode === "apply",
      offline: false,
      databaseName: QA_DATABASE,
      place: "neon-qa",
    };
  }

  if (!LOCAL_HOSTS.has(target.host) || target.databaseName !== CI_DATABASE || env.QA_SEED_CI !== "1") {
    throw new SeedGuardError(
      "BLOQUEADO: fora do Neon QA, só idriacho1_ci em localhost com QA_SEED_CI=1",
    );
  }
  if (target.raw.includes(QA_BRANCH) || target.raw.includes(QA_PROJECT)) {
    throw new SeedGuardError("BLOQUEADO: banco local não pode carregar identificadores do Neon");
  }
  return {
    ok: true,
    persisted: mode === "apply",
    offline: false,
    databaseName: CI_DATABASE,
    place: "ci-local",
  };
}

export function assertLiveDatabaseName(reportedName, expectedName) {
  if (reportedName !== expectedName) {
    throw new SeedGuardError("BLOQUEADO: current_database() não confere com o database autorizado");
  }
}

export async function assertQaApi(fetchImpl = globalThis.fetch) {
  const origin = QA_API_ORIGIN;
  for (const path of ["/meta", "/ready"]) {
    const response = await fetchImpl(`${origin}${path}`, { redirect: "manual" });
    if (!response || response.status !== 200) {
      throw new SeedGuardError("BLOQUEADO: a API QA não confirmou o destino antes da gravação");
    }
    const body = await response.json();
    if (path === "/meta") {
      if (body?.stage !== "non-production" || body?.slug !== "igreja-deus-riacho-fundo-1" || body?.pilot !== true) {
        throw new SeedGuardError("BLOQUEADO: /meta não é a API QA non-production");
      }
    } else if (body?.status !== "ready" || body?.database !== "ok") {
      throw new SeedGuardError("BLOQUEADO: /ready não confirmou o Postgres da API QA");
    }
  }
}
