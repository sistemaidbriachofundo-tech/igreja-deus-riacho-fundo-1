export interface ClientIpInput {
  remoteAddress?: string | null;
  forwardedFor?: string | string[] | undefined;
}

export interface ClientIpOptions {
  trustedProxies: readonly string[];
  trustedHops: number;
}

const REJECTED = new Set(["*", "0.0.0.0/0", "::/0"]);

/**
 * Lista explícita. `0.0.0.0/0` e `*` são descartados: confiar em todo mundo
 * faria o primeiro X-Forwarded-For, forjável, voltar a ser a chave.
 */
export function parseTrustedProxies(raw: string | undefined): string[] {
  if (!raw) return [];
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const item = part.trim();
    if (!item || REJECTED.has(item)) continue;
    if (item.endsWith("/0")) continue;
    out.push(item);
  }
  return out;
}

export function normalizeIp(value: string | null | undefined): string | null {
  if (!value) return null;
  let ip = value.trim();
  if (!ip) return null;
  if (ip.toLowerCase().startsWith("::ffff:")) ip = ip.slice("::ffff:".length);
  if (ip.startsWith("[") && ip.includes("]")) ip = ip.slice(1, ip.indexOf("]"));
  if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(ip)) ip = ip.slice(0, ip.lastIndexOf(":"));
  return ip || null;
}

/**
 * O IP do cliente é o primeiro salto não confiável, contando da direita.
 * O par (socket) entra na cadeia. Se ele não for um proxy da lista, o
 * X-Forwarded-For inteiro é ignorado — inclusive o valor mais à esquerda,
 * que o cliente pode forjar.
 */
export function deriveClientIp(input: ClientIpInput, options: ClientIpOptions): string {
  const peer = normalizeIp(input.remoteAddress) ?? "unknown";
  if (options.trustedHops <= 0 || options.trustedProxies.length === 0) return peer;
  const forwarded = parseForwarded(input.forwardedFor)
    .map((item) => normalizeIp(item))
    .filter((item): item is string => item !== null);
  const hops = [...forwarded, peer];
  let index = hops.length - 1;
  let trusted = 0;
  while (
    index >= 0
    && trusted < options.trustedHops
    && isTrusted(hops[index] ?? "", options.trustedProxies)
  ) {
    trusted += 1;
    index -= 1;
  }
  if (index < 0) return peer;
  return hops[index] ?? peer;
}

function parseForwarded(value: string | string[] | undefined): string[] {
  const raw = Array.isArray(value) ? value.join(",") : value;
  if (!raw) return [];
  return raw.split(",").map((part) => part.trim()).filter((part) => part.length > 0);
}

function isTrusted(ip: string, trusted: readonly string[]): boolean {
  const normalized = normalizeIp(ip);
  if (!normalized) return false;
  for (const entry of trusted) {
    if (entry.includes("/")) {
      if (ipv4InCidr(normalized, entry)) return true;
      continue;
    }
    if (normalizeIp(entry) === normalized) return true;
  }
  return false;
}

function ipv4InCidr(ip: string, cidr: string): boolean {
  const [base, bitsRaw] = cidr.split("/");
  if (!base || bitsRaw == null) return false;
  const bits = Number(bitsRaw);
  if (!Number.isInteger(bits) || bits < 1 || bits > 32) return false;
  const ipInt = ipv4ToInt(ip);
  const baseInt = ipv4ToInt(base);
  if (ipInt == null || baseInt == null) return false;
  const mask = bits === 32 ? 0xffffffff : (0xffffffff << (32 - bits)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = (value * 256 + octet) >>> 0;
  }
  return value;
}
