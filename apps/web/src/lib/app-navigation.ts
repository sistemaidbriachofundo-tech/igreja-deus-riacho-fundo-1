import { percentile, readApiTimings, summarizeApiTimings } from "./api";
import { withBasePath } from "./paths";

export type ClickModifiers = {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
};

/** Rotas do painel. Links públicos e externos continuam com navegação completa. */
export function isInternalAppPath(href: string): boolean {
  if (!href.startsWith("/app")) return false;
  const next = href.charAt(4);
  return next === "" || next === "/" || next === "?" || next === "#";
}

export function shouldInterceptAppNavigation(href: string, event: ClickModifiers): boolean {
  if (event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  return isInternalAppPath(href);
}

type RouterApi = {
  push: (href: string) => void;
  replace: (href: string) => void;
};

let routerApi: RouterApi | null = null;

export function registerAppRouter(router: RouterApi | null): void {
  routerApi = router;
}

export function hasAppRouter(): boolean {
  return routerApi !== null;
}

export function pushAppRoute(href: string): boolean {
  if (!routerApi) return false;
  routerApi.push(href);
  return true;
}

export function replaceAppRoute(href: string): boolean {
  if (!routerApi) return false;
  routerApi.replace(href);
  return true;
}

export type NavigationTiming = {
  href: string;
  durationMs: number;
  at: number;
  client: boolean;
};

const navigationTimings: NavigationTiming[] = [];
let pendingNavigation: { href: string; started: number } | null = null;

function monotonic(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

export function beginClientNavigation(href: string): void {
  pendingNavigation = { href, started: monotonic() };
}

export function finishClientNavigation(pathname: string): NavigationTiming | null {
  if (!pendingNavigation) return null;
  const expected = pendingNavigation.href.split(/[?#]/)[0] || "/app/";
  const normalizedExpected = expected.endsWith("/") ? expected : `${expected}/`;
  const normalizedPath = pathname.endsWith("/") ? pathname : `${pathname}/`;
  if (!normalizedPath.endsWith(normalizedExpected)) return null;
  const sample: NavigationTiming = {
    href: pendingNavigation.href,
    durationMs: Math.max(0, Math.round(monotonic() - pendingNavigation.started)),
    at: Date.now(),
    client: true,
  };
  pendingNavigation = null;
  navigationTimings.push(sample);
  if (navigationTimings.length > 100) navigationTimings.shift();
  return sample;
}

export function readNavigationTimings(): readonly NavigationTiming[] {
  return navigationTimings;
}

export function clearNavigationTimings(): void {
  navigationTimings.length = 0;
  pendingNavigation = null;
}

export function summarizeNavigationTimings(): { count: number; p50Ms: number | null; p95Ms: number | null } {
  const durations = navigationTimings.map(item => item.durationMs);
  return {
    count: durations.length,
    p50Ms: percentile(durations, 50),
    p95Ms: percentile(durations, 95),
  };
}

/** Mesmo contexto JS entre páginas significa que não houve recarga completa. */
export const clientRuntimeId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function publishPerfProbe(): void {
  if (typeof window === "undefined") return;
  const target = window as Window & { __IDBRF_PERF__?: PerfProbe };
  target.__IDBRF_PERF__ = {
    runtimeId: clientRuntimeId,
    api: readApiTimings,
    navigation: readNavigationTimings,
    summary: () => ({
      login: summarizeApiTimings("/auth/login"),
      session: summarizeApiTimings("/auth/me"),
      navigation: summarizeNavigationTimings(),
    }),
  };
}

type PerfProbe = {
  runtimeId: string;
  api: typeof readApiTimings;
  navigation: typeof readNavigationTimings;
  summary: () => {
    login: ReturnType<typeof summarizeApiTimings>;
    session: ReturnType<typeof summarizeApiTimings>;
    navigation: ReturnType<typeof summarizeNavigationTimings>;
  };
};

/**
 * Depois do login, troca a rota no cliente. Sem o roteador do Next
 * (primeiro paint ou export sem JS), cai no endereço com basePath.
 */
export function openAuthenticatedArea(href: string): "client" | "full-load" {
  beginClientNavigation(href);
  if (replaceAppRoute(href)) return "client";
  if (typeof window !== "undefined") window.location.assign(withBasePath(href));
  return "full-load";
}
