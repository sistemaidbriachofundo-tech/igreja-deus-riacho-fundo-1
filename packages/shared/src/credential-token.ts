/** Bytes de entropia do token opaco da carteirinha (QR). */
export const OPAQUE_TOKEN_BYTES = 32;

/**
 * Padrões que NÃO podem aparecer no payload do QR.
 * Token opaco = aleatório base64url; sem CPF, telefone ou PII.
 */
const SENSITIVE_PATTERNS: RegExp[] = [
  /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/, // CPF
  /\b(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?\d{4,5}-?\d{4}\b/, // telefone BR
  /@/, // e-mail
  /\bcpf\b/i,
  /\btelefone\b/i,
  /\bphone\b/i,
];

function randomBytesSecure(size: number): Uint8Array {
  if (typeof globalThis.crypto?.getRandomValues !== "function") {
    throw new Error("crypto.getRandomValues indisponível para token opaco");
  }
  const buf = new Uint8Array(size);
  globalThis.crypto.getRandomValues(buf);
  return buf;
}

function toBase64Url(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64url");
  }
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

/** Gera token opaco (base64url) para o QR da carteirinha. */
export function generateOpaqueCredentialToken(
  bytes: number = OPAQUE_TOKEN_BYTES,
): string {
  if (bytes < 16) {
    throw new Error("Token opaco exige pelo menos 16 bytes de entropia");
  }
  return toBase64Url(randomBytesSecure(bytes));
}

/** True se o valor parece um token opaco (formato), sem validar no banco. */
export function isOpaqueCredentialToken(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  // base64url de 32 bytes ≈ 43 chars; aceita 22+ (16 bytes) até 86 (64 bytes)
  if (!/^[A-Za-z0-9_-]{22,86}$/.test(value)) {
    return false;
  }
  return !containsSensitiveCredentialPayload(value);
}

/**
 * Detecta CPF, telefone, e-mail ou chaves sensíveis no payload do QR.
 * Usado em testes e defesa em profundidade antes de persistir/exibir.
 */
export function containsSensitiveCredentialPayload(payload: string): boolean {
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(payload));
}

/** Lança se o payload do QR carregar dado sensível. */
export function assertOpaqueCredentialPayload(payload: string): void {
  if (containsSensitiveCredentialPayload(payload)) {
    throw new Error(
      "Payload da carteirinha não pode conter CPF, telefone ou PII",
    );
  }
  if (!isOpaqueCredentialToken(payload)) {
    throw new Error("Token da carteirinha inválido (esperado opaco base64url)");
  }
}
