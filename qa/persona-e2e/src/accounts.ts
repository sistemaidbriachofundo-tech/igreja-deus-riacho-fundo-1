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

export async function loginAccount(
  request: APIRequestContext,
  account: PersonaAccount,
): Promise<{ session?: Session; status: number }> {
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
  const body = (await response.json()) as LoginBody;
  if (!body.accessToken || !body.user?.personId) {
    return { status };
  }
  const session: Session = {
    token: body.accessToken,
    email: body.user.email ?? account.email,
    personId: body.user.personId,
    roles: (body.user.grants ?? []).map((grant) => grant.roleCode).filter((role): role is string => Boolean(role)),
  };
  sessions.set(account.email, session);
  return { session, status };
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
