import { createHmac } from "node:crypto";
import type { APIRequestContext } from "@playwright/test";
import type { Persona } from "./matrix.ts";

export type PersonaAccount = {
  persona: Exclude<Persona, "PUBLICACAO" | "PLATAFORMA">;
  email: string;
  seeded: boolean;
};

/** Contas do seed fictício já versionado. A senha não entra neste arquivo. */
export const ACCOUNTS: readonly PersonaAccount[] = [
  { persona: "SECRETARIA", email: "ana.demo@example.test", seeded: true },
  { persona: "PASTOR", email: "pastor.demo@example.test", seeded: true },
  { persona: "TESOURARIA", email: "tesouraria.demo@example.test", seeded: true },
  { persona: "LIDER", email: "lider.jovens.demo@example.test", seeded: true },
  { persona: "MEMBRO", email: "bruno.demo@example.test", seeded: true },
  { persona: "ADMIN", email: "platform.demo@example.test", seeded: true },
  { persona: "EDITOR", email: "editor.demo@example.test", seeded: true },
];

export function demoPassword(): string {
  return process.env.QA_DEMO_PASSWORD?.trim() || "admin";
}

export function apiBase(): string {
  return (process.env.QA_API_BASE_URL ?? "http://127.0.0.1:3001").replace(/\/$/, "");
}

export type Session = {
  token: string;
  email: string;
  roles: string[];
  personId: string;
};

type LoginBody = {
  accessToken?: string;
  user?: {
    email?: string;
    personId?: string;
    grants?: Array<{ roleCode?: string }>;
  };
};

const sessions = new Map<string, Session | { missing: true; status: number }>();
const totpSecrets = new Map<string, string>();

type MfaLoginBody = LoginBody & {
  mfa?: { challengeId?: string; enrollmentRequired?: boolean };
};

function totp(secret: string, now = Date.now()): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const cleaned = secret.replace(/=+$/, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of cleaned) {
    value = (value << 5) | alphabet.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 0xff);
    }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30000)));
  const digest = createHmac("sha1", Buffer.from(bytes)).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  const binary = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(binary).padStart(6, "0");
}

function sessionFrom(email: string, body: LoginBody): Session | undefined {
  if (!body.accessToken || !body.user?.personId) return undefined;
  return {
    token: body.accessToken,
    email: body.user.email ?? email,
    personId: body.user.personId,
    roles: (body.user.grants ?? []).map((grant) => grant.roleCode).filter((role): role is string => Boolean(role)),
  };
}

async function confirmFactor(
  request: APIRequestContext,
  challengeId: string,
  secret: string,
  enroll: boolean,
): Promise<LoginBody | undefined> {
  const path = enroll ? "/auth/mfa/enroll/confirm" : "/auth/mfa/challenge";
  for (const instant of [Date.now(), Date.now() - 30_000]) {
    const verified = await request.post(`${apiBase()}${path}`, {
      data: { challengeId, code: totp(secret, instant) },
      failOnStatusCode: false,
    });
    if (verified.status() >= 400) continue;
    return (await verified.json()) as LoginBody;
  }
  return undefined;
}

/**
 * Conclui o segundo fator quando a API pede enrollment.
 * O segredo TOTP fica só na memória deste processo e não entra no retorno.
 */
async function finishMfa(
  request: APIRequestContext,
  email: string,
  body: MfaLoginBody,
): Promise<{ session?: Session; blocked?: string }> {
  const challengeId = body.mfa?.challengeId;
  if (!challengeId) return { blocked: "A API não devolveu sessão nem desafio MFA." };
  let secret = totpSecrets.get(email);
  if (body.mfa?.enrollmentRequired) {
    const started = await request.post(`${apiBase()}/auth/mfa/enroll`, {
      data: { challengeId },
      failOnStatusCode: false,
    });
    const enrollment = (await started.json().catch(() => ({}))) as { secret?: unknown };
    if (started.status() >= 400 || typeof enrollment.secret !== "string" || enrollment.secret.length < 16) {
      return { blocked: "O cadastro do autenticador falhou. Nenhum segredo foi registrado." };
    }
    secret = enrollment.secret;
    totpSecrets.set(email, secret);
  }
  if (!secret) {
    return { blocked: "O segundo fator já está ativo e o segredo TOTP não está em memória. Nada foi gravado." };
  }
  const verified = await confirmFactor(request, challengeId, secret, Boolean(body.mfa?.enrollmentRequired));
  const session = verified ? sessionFrom(email, verified) : undefined;
  if (!session) return { blocked: "O código do autenticador foi recusado. Nenhum segredo foi registrado." };
  return { session };
}

export async function loginAccount(
  request: APIRequestContext,
  account: PersonaAccount,
): Promise<{ session?: Session; status: number; blocked?: string }> {
  const cached = sessions.get(account.email);
  if (cached && "token" in cached) return { session: cached, status: 200 };
  if (cached && "missing" in cached) return { status: cached.status };

  const response = await request.post(`${apiBase()}/auth/login`, {
    data: { email: account.email, password: demoPassword() },
    failOnStatusCode: false,
  });
  const status = response.status();
  if (status !== 200 && status !== 201) {
    sessions.set(account.email, { missing: true, status });
    return { status };
  }
  const body = (await response.json()) as MfaLoginBody;
  const direct = sessionFrom(account.email, body);
  if (direct) {
    sessions.set(account.email, direct);
    return { session: direct, status };
  }
  const finished = await finishMfa(request, account.email, body);
  if (finished.session) sessions.set(account.email, finished.session);
  return { status, ...finished };
}

export async function apiStatus(
  request: APIRequestContext,
  token: string,
  method: "GET" | "PATCH",
  path: string,
  data?: unknown,
): Promise<number> {
  const options = {
    headers: { Authorization: `Bearer ${token}` },
    failOnStatusCode: false,
    data,
  };
  const response =
    method === "GET"
      ? await request.get(`${apiBase()}${path}`, options)
      : await request.patch(`${apiBase()}${path}`, options);
  return response.status();
}

export async function apiJson<T>(
  request: APIRequestContext,
  token: string,
  path: string,
): Promise<{ status: number; body: T | null }> {
  const response = await request.get(`${apiBase()}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    failOnStatusCode: false,
  });
  if (!response.ok()) return { status: response.status(), body: null };
  return { status: response.status(), body: (await response.json()) as T };
}

export async function apiCall(
  request: APIRequestContext,
  token: string | null,
  method: "GET" | "POST" | "PATCH",
  path: string,
  data?: unknown,
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const url = `${apiBase()}${path}`;
  const options = { headers, failOnStatusCode: false, data };
  const response =
    method === "GET"
      ? await request.get(url, options)
      : method === "POST"
        ? await request.post(url, options)
        : await request.patch(url, options);
  const status = response.status();
  const text = await response.text();
  if (!text) return { status, body: null };
  try {
    return { status, body: JSON.parse(text) as unknown };
  } catch {
    return { status, body: null };
  }
}
