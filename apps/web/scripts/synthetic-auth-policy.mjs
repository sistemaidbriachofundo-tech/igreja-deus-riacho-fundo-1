import { randomBytes } from "node:crypto";

const LOOPBACK_ORIGIN = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/;

/** Origem só de loopback. Nunca reflete um Origin arbitrário e nunca usa *. */
export function corsHeaders(origin) {
  if (typeof origin === "string" && LOOPBACK_ORIGIN.test(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      Vary: "Origin",
    };
  }
  return {};
}

/** Recusa senha ausente, curta ou igual a um valor público conhecido. */
export function assertStubPassword(password) {
  const value = typeof password === "string" ? password : "";
  if (value.length < 16 || value === "sintetica-local" || value === "admin" || value === "password") {
    throw new Error("STUB_PASSWORD precisa ter pelo menos 16 caracteres e não pode ser uma senha pública.");
  }
  return value;
}

export function createSessionToken() {
  return randomBytes(32).toString("base64url");
}
