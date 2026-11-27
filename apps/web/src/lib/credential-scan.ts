import { isOpaqueCredentialToken } from "@idbrf/shared";
import { withBasePath } from "./paths";

export function credentialScanUrl(origin: string, token: string): string | null {
  if (!isOpaqueCredentialToken(token)) return null;
  const url = new URL(withBasePath("/validar-carteirinha/"), origin);
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  // Keep the credential token out of the web server request and the referrer.
  url.hash = token;
  return url.href;
}

export function credentialTokenFromHash(hash: string): string | null {
  const token = hash.slice(1);
  return hash.startsWith("#") && isOpaqueCredentialToken(token) ? token : null;
}
