/**
 * Número de saltos de proxy confiáveis.
 * Fora da Vercel, X-Forwarded-For só entra no cálculo do Express quando TRUST_PROXY é um inteiro.
 * O limitador da aplicação usa req.ip e não relê o primeiro salto enviado pelo cliente.
 */
export function resolveTrustProxyHops(env: {
  TRUST_PROXY?: string;
  VERCEL?: string;
  VERCEL_ENV?: string;
}): number {
  const raw = env.TRUST_PROXY?.trim() ?? "";
  if (/^\d+$/.test(raw)) return Number(raw);
  if (env.VERCEL === "1" || env.VERCEL_ENV) return 1;
  return 0;
}
