import { createHash, randomBytes } from "node:crypto";

export function hashOpaqueToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function generateOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

export function acceptRequestId(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!/^[A-Za-z0-9._:-]{8,80}$/.test(trimmed)) return undefined;
  return trimmed;
}
