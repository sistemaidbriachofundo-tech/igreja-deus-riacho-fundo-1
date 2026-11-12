const testTarget = /(?:^|[._-])(?:hml|qa|demo|sandbox|preview|test)(?:[._-]|$)/i;

export function assertProductionConfiguration(env: NodeJS.ProcessEnv): void {
  if (env.IDBRF_RUNTIME_STAGE !== "production") return;

  if (env.NODE_ENV !== "production" || env.HML_DEMO_PASSWORD_HASH || env.SEED_HML_MASS === "true") {
    throw new Error("A API de produção exige configuração sem dados sintéticos");
  }

  let database: URL;
  try {
    database = new URL(env.DATABASE_URL ?? "");
  } catch {
    throw new Error("DATABASE_URL inválida para produção");
  }

  const name = database.pathname.slice(1);
  if (
    !["postgres:", "postgresql:"].includes(database.protocol) ||
    !database.username || !database.password ||
    !env.PRODUCTION_DATABASE_HOST || database.hostname !== env.PRODUCTION_DATABASE_HOST ||
    !env.PRODUCTION_DATABASE_NAME || name !== env.PRODUCTION_DATABASE_NAME ||
    testTarget.test(name) || testTarget.test(database.hostname) ||
    !["require", "verify-full"].includes(database.searchParams.get("sslmode") ?? "")
  ) {
    throw new Error("O banco de produção deve usar o destino autorizado e conexão TLS");
  }

  const jwt = env.JWT_SECRET?.trim() ?? "";
  if (jwt.length < 32 || jwt.startsWith("dev-only-")) {
    throw new Error("Configure uma chave de sessão exclusiva para produção");
  }

  if (!/^[1-9]\d*$/.test(env.TRUST_PROXY?.trim() ?? "")) {
    throw new Error("Produção exige TRUST_PROXY com o número de saltos do proxy conhecido");
  }
  if (env.F11_MFA_BLOCKING !== "true") {
    throw new Error("Produção exige MFA bloqueante para papéis privilegiados");
  }
  if (env.AUTH_STATE_STORE === "memory") {
    throw new Error("Produção não admite sessão em memória");
  }
  if (env.RATE_LIMIT_STORE === "memory") {
    throw new Error("Produção não admite limite só em memória");
  }
  if ((env.F11_MFA_ENFORCEMENT ?? "PRIVILEGED").toUpperCase() === "OFF") {
    throw new Error("Produção não admite política MFA desligada");
  }

  const privateBlob = env.PRIVATE_BLOB_READ_WRITE_TOKEN?.trim();
  if (!privateBlob || privateBlob === env.BLOB_READ_WRITE_TOKEN?.trim()) {
    throw new Error("Configure o armazenamento privado separado da biblioteca pública");
  }

  const origins = env.CORS_ORIGIN?.split(",").map(origin => origin.trim()) ?? [];
  const allowed = origins.length > 0 && origins.every(origin => {
    try {
      const url = new URL(origin);
      return url.protocol === "https:" && url.origin === origin &&
        url.hostname !== "localhost" && !testTarget.test(url.hostname);
    } catch {
      return false;
    }
  });
  if (!allowed) throw new Error("CORS de produção requer origens HTTPS explícitas");
}
