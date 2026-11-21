/**
 * Guarda fail-closed da massa visual de DEV.
 * Não imprime senha, host completo nem a URL.
 * Só grava no ramo Neon QA identificado, ou num Postgres local de CI com nome distinto.
 */

export const QA_BRANCH_ID = "br-twilight-bonus-b6moawk7";
export const QA_PROJECT_ID = "flat-tree-17047178";
export const QA_DATABASE_NAME = "idriacho1_hml";
export const QA_CONFIRM = QA_BRANCH_ID;
export const CI_DATABASE_NAME = "idriacho1_qa_ci";
export const CI_CONFIRM = "local-qa-ci";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
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
  if (!databaseName || databaseName.includes("/") || databaseName.includes("?")) {
    throw new SeedGuardError("BLOQUEADO: database_name ausente na URL");
  }
  return {
    databaseName,
    host: url.hostname.toLowerCase(),
    sslmode: url.searchParams.get("sslmode"),
  };
}

function isNeonHost(host) {
  return host === "neon.tech" || host.endsWith(".neon.tech");
}

/**
 * @param {{ databaseUrl?: string, mode: "dry-run" | "apply", env?: NodeJS.ProcessEnv }} input
 */
export function assertQaSeedTarget(input) {
  const mode = input.mode;
  const env = input.env ?? {};
  if (env.IDBRF_RUNTIME_STAGE === "production" || env.IDBRF_RUNTIME_STAGE === "hml") {
    throw new SeedGuardError("BLOQUEADO: seed visual proibida com estágio production ou hml");
  }
  if (mode === "dry-run") {
    return { ok: true, persisted: false, offline: true, place: "offline", databaseName: null };
  }
  if (env.VERCEL === "1") {
    throw new SeedGuardError("BLOQUEADO: esta seed não roda dentro do build da Vercel");
  }
  const databaseUrl = input.databaseUrl?.trim();
  if (!databaseUrl) {
    throw new SeedGuardError("BLOQUEADO: --apply exige DATABASE_URL. Nenhum banco foi contactado.");
  }
  const target = parseDatabaseTarget(databaseUrl);
  if (BLOCKED_HOST_MARKERS.some((marker) => target.host.includes(marker))) {
    throw new SeedGuardError("BLOQUEADO: endpoint de outro ambiente. Nenhum banco foi contactado.");
  }
  const neon = isNeonHost(target.host);
  const local = LOCAL_HOSTS.has(target.host);
  if (neon) {
    if (target.databaseName !== QA_DATABASE_NAME) {
      throw new SeedGuardError("BLOQUEADO: o database_name do Neon não é o ramo QA autorizado");
    }
    if (!target.host.includes(QA_BRANCH_ID)) {
      throw new SeedGuardError("BLOQUEADO: o host não identifica o ramo QA. Nenhum banco foi contactado.");
    }
    if (!["require", "verify-full"].includes(target.sslmode ?? "")) {
      throw new SeedGuardError("BLOQUEADO: o Neon QA exige sslmode=require ou verify-full");
    }
    if (env.QA_SEED_CONFIRM !== QA_CONFIRM) {
      throw new SeedGuardError("BLOQUEADO: --apply no Neon exige QA_SEED_CONFIRM com o identificador do ramo QA");
    }
    if (env.IDBRF_RUNTIME_STAGE !== "qa") {
      throw new SeedGuardError("BLOQUEADO: --apply no Neon exige IDBRF_RUNTIME_STAGE=qa");
    }
    return {
      ok: true,
      persisted: true,
      offline: false,
      place: "neon-qa",
      databaseName: QA_DATABASE_NAME,
      branchId: QA_BRANCH_ID,
    };
  }
  if (!local || target.databaseName !== CI_DATABASE_NAME) {
    throw new SeedGuardError("BLOQUEADO: só o ramo QA no Neon, ou idriacho1_qa_ci em localhost");
  }
  if (env.QA_SEED_CI !== "1" || env.QA_SEED_CONFIRM !== CI_CONFIRM || env.IDBRF_RUNTIME_STAGE !== "qa") {
    throw new SeedGuardError("BLOQUEADO: o Postgres local exige QA_SEED_CI=1, confirmação local e estágio qa");
  }
  return {
    ok: true,
    persisted: true,
    offline: false,
    place: "ci-local",
    databaseName: CI_DATABASE_NAME,
    branchId: null,
  };
}

export function assertLiveQaIdentity(row, target) {
  const reported = Array.isArray(row) ? row[0] : row;
  const databaseName = reported?.database_name ?? reported?.databaseName;
  if (databaseName !== target.databaseName) {
    throw new SeedGuardError("BLOQUEADO: current_database() não confere com o banco autorizado");
  }
  const branchId = reported?.branch_id ?? reported?.branchId ?? null;
  if (target.place === "neon-qa") {
    if (branchId && branchId !== QA_BRANCH_ID) {
      throw new SeedGuardError("BLOQUEADO: neon.branch_id não é o ramo QA");
    }
  }
  return { databaseName, branchId: branchId || null };
}
