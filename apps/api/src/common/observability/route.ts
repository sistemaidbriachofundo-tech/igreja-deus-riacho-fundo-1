import { redactText } from "./redaction";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX_TOKEN = /^[0-9a-f]{16,}$/i;
const NUMERIC = /^\d+$/;
const SLUG = /^[a-z0-9-]{1,48}$/;
const SECRET_PREFIX = new Set(["verify", "token", "tokens", "reset", "callback"]);

export function stripQuery(url: string): string {
  const query = url.indexOf("?");
  const hash = url.indexOf("#");
  let end = url.length;
  if (query >= 0) end = Math.min(end, query);
  if (hash >= 0) end = Math.min(end, hash);
  return url.slice(0, end);
}

/** Rota estável para log e chave de limite. Query, e-mail e token de path saem. */
export function normalizeRoute(url: string): string {
  const path = stripQuery(url || "/");
  let previous = "";
  const segments = path.split("/").filter((segment) => segment.length > 0).map((segment) => {
    const normalized = normalizeSegment(segment, previous);
    previous = normalized;
    return normalized;
  });
  const route = `/${segments.join("/")}`;
  return route.length > 180 ? route.slice(0, 180) : route || "/";
}

function normalizeSegment(segment: string, previous: string): string {
  if (SECRET_PREFIX.has(previous)) return ":id";
  let decoded = segment;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    return ":id";
  }
  if (decoded.includes("/") || decoded.includes("\\") || decoded.includes("@")) return ":id";
  if (UUID.test(decoded) || HEX_TOKEN.test(decoded) || NUMERIC.test(decoded)) return ":id";
  if (decoded.length > 48) return ":id";
  if (redactText(decoded) !== decoded) return ":id";
  const lowered = decoded.toLowerCase();
  if (!SLUG.test(lowered)) return ":id";
  return lowered;
}

export function isQuietRoute(route: string): boolean {
  return route === "/health"
    || route === "/ready"
    || route.startsWith("/internal/observability/");
}

export function isReadinessRoute(route: string): boolean {
  return route === "/ready" || route === "/internal/observability/ready";
}
