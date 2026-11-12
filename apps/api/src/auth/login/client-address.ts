/**
 * Endereço já resolvido pelo adaptador HTTP.
 * Não lê X-Forwarded-For: o primeiro valor desse header é controlável pelo cliente.
 * `req.ip` só reflete o proxy quando o integrador liga `trust proxy` com um salto
 * (`TRUST_PROXY=1` em main.ts). Auth não reinterpreta o header.
 */
export function clientAddress(request: {
  ip?: string;
  socket?: { remoteAddress?: string | null };
}): string {
  const raw = request.ip || request.socket?.remoteAddress || "";
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 64 || !/^[0-9a-fA-F:.]+$/.test(trimmed)) {
    return "unknown";
  }
  return trimmed;
}
