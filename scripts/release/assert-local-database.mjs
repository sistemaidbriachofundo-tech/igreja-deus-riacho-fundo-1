/**
 * Impede migração fora de um Postgres local.
 * Não abre conexão e não imprime senha.
 */
const raw = process.env.DATABASE_URL ?? "";
if (!raw.trim()) {
  console.log("DATABASE_URL ausente. Nenhuma migração será executada.");
  process.exit(0);
}

let url;
try {
  url = new URL(raw);
} catch {
  console.error("DATABASE_URL inválida. Nenhuma migração foi executada.");
  process.exit(1);
}

const host = url.hostname.replace(/^\[|\]$/g, "");
const local = new Set(["localhost", "127.0.0.1", "::1"]);
const remoteMarker = /neon\.tech|vercel|hostinger|amazonaws|supabase|render\.com/i;
if (!local.has(host) || remoteMarker.test(raw)) {
  console.error(
    `BLOQUEADO: banco ${host}/${url.pathname.replace(/^\//, "") || "(sem nome)"} não é Postgres local. Nenhuma migração foi executada.`,
  );
  process.exit(1);
}

console.log(`Banco local confirmado em ${host}/${url.pathname.replace(/^\//, "")}. Senha omitida.`);
