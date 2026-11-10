/**
 * Guarda fail-closed da massa de homologação.
 * Não imprime senha, host completo de Neon nem a URL.
 */

export const HML_DATABASE_NAME = "idriacho1_hml";
export const CI_DATABASE_NAMES = new Set(["idbrf", "idriacho1_ci"]);

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

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
  };
}

function isNeonHost(host) {
  return host === "neon.tech" || host.endsWith(".neon.tech");
}

/**
 * @param {{ databaseUrl?: string, mode: "plan" | "dry-run" | "apply" | "rollback", env?: NodeJS.ProcessEnv }} input
 */
export function assertSeedTarget(input) {
  const mode = input.mode;
  const env = input.env ?? {};
  if (mode === "plan") {
    return {
      ok: true,
      persisted: false,
      offline: true,
      databaseName: null,
      place: "offline",
    };
  }

  const databaseUrl = input.databaseUrl?.trim();
  if (!databaseUrl) {
    if (mode === "dry-run") {
      return {
        ok: true,
        persisted: false,
        offline: true,
        databaseName: null,
        place: "offline",
      };
    }
    throw new SeedGuardError(
      "BLOQUEADO: --apply e --rollback exigem DATABASE_URL. Nenhum banco foi contactado.",
    );
  }

  const target = parseDatabaseTarget(databaseUrl);
  const neon = isNeonHost(target.host);
  const local = LOCAL_HOSTS.has(target.host);

  if (neon) {
    if (target.databaseName !== HML_DATABASE_NAME) {
      throw new SeedGuardError(
        "BLOQUEADO: host Neon com database_name diferente de idriacho1_hml",
      );
    }
    if (env.HML_SEED_CONFIRM !== HML_DATABASE_NAME) {
      throw new SeedGuardError(
        "BLOQUEADO: Neon idriacho1_hml exige HML_SEED_CONFIRM=idriacho1_hml",
      );
    }
    if ((mode === "apply" || mode === "rollback") && env.HML_SEED_OPERATOR !== "integrator-j") {
      throw new SeedGuardError(
        "BLOQUEADO: apply e rollback no Neon somente com HML_SEED_OPERATOR=integrator-j, depois de backup e revisão",
      );
    }
    return {
      ok: true,
      persisted: mode === "apply" || mode === "rollback",
      offline: false,
      databaseName: HML_DATABASE_NAME,
      place: "neon-hml",
    };
  }

  if (!local || !CI_DATABASE_NAMES.has(target.databaseName)) {
    throw new SeedGuardError(
      "BLOQUEADO: só idriacho1_hml no Neon, ou idbrf/idriacho1_ci em localhost",
    );
  }
  if (env.HML_SEED_CI !== "1") {
    throw new SeedGuardError(
      "BLOQUEADO: banco local exige HML_SEED_CI=1. Este não é o Neon de homologação.",
    );
  }
  return {
    ok: true,
    persisted: mode === "apply" || mode === "rollback",
    offline: false,
    databaseName: target.databaseName,
    place: "ci-local",
  };
}

export function assertLiveDatabaseName(reportedName, expectedName) {
  if (reportedName !== expectedName) {
    throw new SeedGuardError(
      "BLOQUEADO: current_database() não confere com o database_name autorizado",
    );
  }
}
