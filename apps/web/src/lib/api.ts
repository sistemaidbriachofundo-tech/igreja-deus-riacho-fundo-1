import { publicApiBase } from "./portal-live-data";

/**
 * Fail closed: um site público sem API homologada não deve chamar o
 * localhost de quem está navegando. Apenas DEV local usa fallback.
 */
export function getApiBaseUrl(): string {
  const configured = publicApiBase(process.env.NEXT_PUBLIC_API_URL);
  if (configured) {
    const url = new URL(configured);
    const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
    if (local && process.env.NODE_ENV !== "development") {
      throw new Error("API local permitida somente em desenvolvimento.");
    }
    return configured;
  }
  if (process.env.NODE_ENV === "development") return "http://localhost:3001";
  throw new Error("API autenticada não configurada ou URL insegura.");
}

export interface LoginResult {
  accessToken: string;
  tokenType: "Bearer";
  expiresInSeconds: number;
  user: {
    userId: string;
    personId: string;
    email: string;
    grants: Array<{
      roleCode: string;
      organizationId?: string | null;
      churchId?: string | null;
    }>;
  };
}

export async function apiLogin(
  email: string,
  password: string,
): Promise<LoginResult> {
  const res = await fetch(`${getApiBaseUrl()}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Login falhou (${res.status})`);
  }
  return res.json() as Promise<LoginResult>;
}

export async function apiGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `GET ${path} falhou (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export async function apiPost<T>(
  path: string,
  token: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `POST ${path} falhou (${res.status})`);
  }
  return res.json() as Promise<T>;
}

/** Alterações restritas via backend com validação de papel e escopo na API. */
export async function apiPatch<T>(
  path: string,
  token: string,
  body: unknown,
): Promise<T> {
  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || `PATCH ${path} falhou (${res.status})`);
  }
  return res.json() as Promise<T>;
}

const TOKEN_KEY = "idbrf_demo_token";

export function loadStoredToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.sessionStorage.getItem(TOKEN_KEY);
}

export function storeToken(token: string): void {
  window.sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  window.sessionStorage.removeItem(TOKEN_KEY);
}
