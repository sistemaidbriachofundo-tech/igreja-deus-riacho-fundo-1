import { isProductionAdmin, PRODUCTION_API_ORIGIN } from "./admin-environment";
import { publicApiBase } from "./portal-live-data";

/**
 * Fail closed: um site público sem API homologada não deve chamar o
 * localhost de quem está navegando. Apenas DEV local usa fallback.
 */
export function getApiBaseUrl(): string {
  const configured = publicApiBase(process.env.NEXT_PUBLIC_API_URL);
  if (isProductionAdmin() && configured !== PRODUCTION_API_ORIGIN) {
    throw new Error("API de produção não configurada.");
  }
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
  user: AuthUser;
}

export interface LoginChallenge {
  mfa: {
    challengeId: string;
    expiresInSeconds: number;
    enrollmentRequired: boolean;
  };
}

export interface MfaEnrollment {
  secret: string;
  otpauthUri: string;
}

export interface AuthUser {
  userId: string;
  personId: string;
  email: string;
  grants: Array<{
    roleCode: string;
    organizationId?: string | null;
    churchId?: string | null;
  }>;
}

export type ApiFailureKind = "unauthorized" | "forbidden" | "timeout" | "network" | "http";

/** Falha de transporte ou HTTP, com o status real quando a API respondeu. */
export class ApiRequestError extends Error {
  readonly status: number | null;
  readonly kind: ApiFailureKind;

  constructor(message: string, status: number | null, kind: ApiFailureKind) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.kind = kind;
  }
}

/** Só 401 de sessão inválida encerra o token. Timeout, 403 e falha de lista não entram. */
export function isInvalidSession(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 401;
}

/** Alinhado ao timeout das leituras públicas. Não é um 401. */
export const API_TIMEOUT_MS = 8_000;
/** Login e MFA precisam tolerar a inicialização da API antes de cancelar a requisição. */
const AUTH_TIMEOUT_MS = 20_000;
/** Evita repetir /auth/me a cada troca de página. O servidor continua autorizando os dados. */
export const SESSION_FRESH_MS = 120_000;
export const SESSION_UNAUTHORIZED_EVENT = "idbrf:session-unauthorized";

export type ApiCallOptions = {
  timeoutMs?: number;
  /** Ignora a confirmação recente e consulta /auth/me de novo. */
  fresh?: boolean;
};

export type ApiTiming = {
  method: string;
  path: string;
  durationMs: number;
  ok: boolean;
  status: number | null;
  fromCache: boolean;
  at: number;
};

const timings: ApiTiming[] = [];

function noteTiming(sample: Omit<ApiTiming, "at">): void {
  timings.push({ ...sample, at: Date.now() });
  if (timings.length > 200) timings.shift();
}

export function readApiTimings(): readonly ApiTiming[] {
  return timings;
}

export function clearApiTimings(): void {
  timings.length = 0;
}

/** Percentil pelo método do posto mais próximo (nearest rank). */
export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0 || p <= 0 || p > 100) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1] ?? null;
}

export function summarizeApiTimings(path?: string): {
  count: number;
  network: number;
  fromCache: number;
  ok: number;
  p50Ms: number | null;
  p95Ms: number | null;
} {
  const rows = timings.filter(item => !path || item.path === path);
  const network = rows.filter(item => !item.fromCache);
  const durations = network.map(item => item.durationMs);
  return {
    count: rows.length,
    network: network.length,
    fromCache: rows.filter(item => item.fromCache).length,
    ok: rows.filter(item => item.ok).length,
    p50Ms: percentile(durations, 50),
    p95Ms: percentile(durations, 95),
  };
}

/** Resumo por endpoint, sem registrar parâmetros, credenciais ou respostas. */
export type EndpointTimingSummary = {
  method: string;
  path: string;
  requests: number;
  failures: number;
  cacheHits: number;
  p50Ms: number | null;
  p95Ms: number | null;
};

export function summarizeEndpoints(): EndpointTimingSummary[] {
  const groups = new Map<string, ApiTiming[]>();
  for (const sample of timings) {
    // O caminho registrado é a rota, nunca um token ou corpo de requisição.
    const key = `${sample.method} ${sample.path}`;
    const group = groups.get(key) ?? [];
    group.push(sample);
    groups.set(key, group);
  }
  return [...groups.values()].map(group => {
    const network = group.filter(item => !item.fromCache);
    const durations = network.map(item => item.durationMs);
    return {
      method: group[0].method,
      path: group[0].path,
      requests: group.length,
      failures: network.filter(item => !item.ok).length,
      cacheHits: group.length - network.length,
      p50Ms: percentile(durations, 50),
      p95Ms: percentile(durations, 95),
    };
  }).sort((left, right) => (right.p95Ms ?? -1) - (left.p95Ms ?? -1));
}

type CachedSession = { token: string; user: AuthUser; at: number };
let cachedSession: CachedSession | null = null;

function cloneUser(user: AuthUser): AuthUser {
  return {
    userId: user.userId,
    personId: user.personId,
    email: user.email,
    grants: user.grants.map(grant => ({ ...grant })),
  };
}

function isAuthUser(value: unknown): value is AuthUser {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<AuthUser>;
  return typeof record.userId === "string"
    && typeof record.personId === "string"
    && typeof record.email === "string"
    && Array.isArray(record.grants);
}

export function rememberValidatedSession(token: string, user: AuthUser, at = Date.now()): void {
  cachedSession = { token, user: cloneUser(user), at };
}

export function readValidatedSession(token: string, at = Date.now(), allowStale = false): AuthUser | null {
  if (!cachedSession || cachedSession.token !== token) return null;
  if (!allowStale && at - cachedSession.at > SESSION_FRESH_MS) return null;
  return cloneUser(cachedSession.user);
}

export function forgetValidatedSession(): void {
  cachedSession = null;
  inflightSession = null;
}

export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiRequestError && error.kind === "unauthorized";
}

export function isForbidden(error: unknown): boolean {
  return error instanceof ApiRequestError && error.kind === "forbidden";
}

export function isTransientFailure(error: unknown): boolean {
  return error instanceof ApiRequestError && (error.kind === "timeout" || error.kind === "network");
}

export function loginFailureMessage(error: unknown): string {
  if (error instanceof ApiRequestError && error.kind === "timeout") {
    return "O serviço de acesso demorou para responder. Tente novamente.";
  }
  if (error instanceof ApiRequestError && error.kind === "network") {
    return "Não foi possível conectar ao serviço de acesso. Tente novamente.";
  }
  if (isUnauthorized(error) || isForbidden(error)) {
    return "E-mail ou senha não autorizados. Confira seus dados.";
  }
  if (error instanceof ApiRequestError && error.status === 429) {
    return "Muitas tentativas. Tente novamente mais tarde.";
  }
  if (error instanceof Error && /429|limite|rate/i.test(error.message)) {
    return "Muitas tentativas. Tente novamente mais tarde.";
  }
  if (error instanceof Error && /401|403|credencial|senha|autentica|invalid/i.test(error.message)) {
    return "E-mail ou senha não autorizados. Confira seus dados.";
  }
  return "Não foi possível conectar ao serviço de acesso. Tente novamente.";
}

function monotonicMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function kindForStatus(status: number): ApiFailureKind {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 408 || status === 504) return "timeout";
  return "http";
}

function emitSessionUnauthorized(): void {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
  window.dispatchEvent(new Event(SESSION_UNAUTHORIZED_EVENT));
}

async function apiFetch(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      cache: "no-store",
      credentials: "omit",
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new ApiRequestError("Tempo esgotado ao contactar o serviço de acesso.", null, "timeout");
    }
    const message = error instanceof Error && error.message ? error.message : "Falha de rede";
    throw new ApiRequestError(message, null, "network");
  } finally {
    clearTimeout(timer);
  }
}

async function requestJson<T>(
  method: "GET" | "POST" | "PATCH",
  path: string,
  token: string | null,
  body: unknown | undefined,
  options: ApiCallOptions | undefined,
): Promise<{ data: T; status: number }> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (method !== "GET") headers["Content-Type"] = "application/json";
  const init: RequestInit = { method, headers };
  if (method !== "GET") init.body = body === undefined ? undefined : JSON.stringify(body);
  const res = await apiFetch(`${getApiBaseUrl()}${path}`, init, options?.timeoutMs ?? API_TIMEOUT_MS);
  if (!res.ok) {
    const text = await res.text();
    const fallback = method === "POST" && path === "/auth/login"
      ? `Login falhou (${res.status})`
      : `${method} ${path} falhou (${res.status})`;
    throw new ApiRequestError(text || fallback, res.status, kindForStatus(res.status));
  }
  return { data: await res.json() as T, status: res.status };
}

async function settle<T>(
  method: "GET" | "POST" | "PATCH",
  path: string,
  token: string | null,
  body: unknown | undefined,
  options: ApiCallOptions | undefined,
  authenticated: boolean,
): Promise<T> {
  const started = monotonicMs();
  try {
    const { data, status } = await requestJson<T>(method, path, token, body, options);
    noteTiming({
      method,
      path,
      durationMs: Math.max(0, Math.round(monotonicMs() - started)),
      ok: true,
      status,
      fromCache: false,
    });
    return data;
  } catch (error) {
    const status = error instanceof ApiRequestError ? error.status : null;
    noteTiming({
      method,
      path,
      durationMs: Math.max(0, Math.round(monotonicMs() - started)),
      ok: false,
      status,
      fromCache: false,
    });
    if (authenticated && isUnauthorized(error)) {
      clearToken();
      emitSessionUnauthorized();
    }
    throw error;
  }
}

export function beginLogin(email: string, password: string, options?: ApiCallOptions) {
  return settle<LoginResult | LoginChallenge>(
    "POST", "/auth/login", null, { email, password },
    { ...options, timeoutMs: options?.timeoutMs ?? AUTH_TIMEOUT_MS }, false,
  );
}

export async function apiLogin(email: string, password: string, options?: ApiCallOptions): Promise<LoginResult> {
  const result = await beginLogin(email, password, options);
  if (!("accessToken" in result)) {
    throw new ApiRequestError("Entre pela tela de acesso para confirmar o segundo fator.", null, "http");
  }
  return result;
}

export function beginMfaEnrollment(challengeId: string) {
  return settle<MfaEnrollment>("POST", "/auth/mfa/enroll", null, { challengeId }, { timeoutMs: AUTH_TIMEOUT_MS }, false);
}

export function verifyLoginChallenge(challenge: LoginChallenge["mfa"], code: string) {
  const path = challenge.enrollmentRequired ? "/auth/mfa/enroll/confirm" : "/auth/mfa/challenge";
  return settle<LoginResult>(
    "POST", path, null, { challengeId: challenge.challengeId, code },
    { timeoutMs: AUTH_TIMEOUT_MS }, false,
  );
}

export function mfaFailureMessage(error: unknown): string {
  if (isUnauthorized(error)) {
    return error instanceof Error && /MFA_EXPIRED|MFA_REPLAY/.test(error.message)
      ? "Esta verificação terminou. Volte e entre novamente."
      : "Não foi possível confirmar o código. Confira o código atual no autenticador.";
  }
  return loginFailureMessage(error);
}

/** Uma única consulta de /auth/me em voo por token; não cacheia falhas nem autorização fora do servidor. */
let inflightSession: { token: string; promise: Promise<AuthUser> } | null = null;

export async function apiGet<T>(path: string, token: string, options?: ApiCallOptions): Promise<T> {
  if (path !== "/auth/me") return settle<T>("GET", path, token, undefined, options, true);
  if (options?.fresh !== true) {
    const cached = readValidatedSession(token);
    if (cached) {
      noteTiming({ method: "GET", path, durationMs: 0, ok: true, status: 200, fromCache: true });
      return cached as T;
    }
  }
  if (inflightSession?.token === token) return await inflightSession.promise as T;
  const promise: Promise<AuthUser> = (async () => {
    try {
      const data = await settle<AuthUser>("GET", path, token, undefined, options, true);
      if (isAuthUser(data)) rememberValidatedSession(token, data);
      return data;
    } catch (error) {
      if (isTransientFailure(error)) {
        const stale = readValidatedSession(token, Date.now(), true);
        if (stale) {
          noteTiming({ method: "GET", path, durationMs: 0, ok: true, status: 200, fromCache: true });
          return stale;
        }
      }
      throw error;
    }
  })();
  inflightSession = { token, promise };
  try { return await promise as T; }
  finally { if (inflightSession?.promise === promise) inflightSession = null; }
}

export async function apiPost<T>(path: string, token: string, body?: unknown, options?: ApiCallOptions): Promise<T> {
  return settle<T>("POST", path, token, body, options, true);
}

/** Alterações restritas via backend com validação de papel e escopo na API. */
export async function apiPatch<T>(path: string, token: string, body: unknown, options?: ApiCallOptions): Promise<T> {
  return settle<T>("PATCH", path, token, body, options, true);
}

const TOKEN_KEY = "idbrf_demo_token";

export function loadStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(TOKEN_KEY);
}

export function storeToken(token: string): void {
  window.sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  forgetValidatedSession();
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(TOKEN_KEY);
}

export async function signOutSession(): Promise<void> {
  const token = loadStoredToken();
  clearToken();
  if (!token) return;
  // An older API may lack this route. Always clear the local session as well.
  await settle("POST", "/auth/logout", token, undefined, { timeoutMs: 4500 }, false);
}
