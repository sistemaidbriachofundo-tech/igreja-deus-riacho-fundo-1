import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Cifra segredo TOTP com AES-256-GCM.
 * Chave: MFA_ENCRYPTION_KEY (≥32 chars) ou derivada de JWT_SECRET (DEV only).
 */
export function encryptTotpSecret(plaintext: string): string {
  const key = resolveMfaKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${enc.toString("base64url")}`;
}

export function decryptTotpSecret(ciphertext: string): string {
  const parts = ciphertext.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("Formato de secret MFA inválido");
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const key = resolveMfaKey();
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivB64!, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagB64!, "base64url"));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(dataB64!, "base64url")),
    decipher.final(),
  ]);
  return dec.toString("utf8");
}

function resolveMfaKey(): Buffer {
  const raw =
    process.env.MFA_ENCRYPTION_KEY?.trim() ||
    process.env.JWT_SECRET?.trim() ||
    "dev-only-mfa-encryption-key-32chars!!";
  return createHash("sha256").update(raw, "utf8").digest();
}
