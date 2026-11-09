import { afterEach, describe, expect, it, vi } from "vitest";
import {
  beginClientNavigation, clearNavigationTimings, finishClientNavigation, isInternalAppPath,
  openAuthenticatedArea, registerAppRouter, shouldInterceptAppNavigation, summarizeNavigationTimings,
} from "./app-navigation";

const originalBase = process.env.NEXT_PUBLIC_BASE_PATH;
const click = {
  button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false,
};

afterEach(() => {
  if (originalBase === undefined) delete process.env.NEXT_PUBLIC_BASE_PATH;
  else process.env.NEXT_PUBLIC_BASE_PATH = originalBase;
  registerAppRouter(null);
  clearNavigationTimings();
  vi.unstubAllGlobals();
});

describe("navegação do painel sem recarga", () => {
  it("intercepta só o clique simples dentro de /app", () => {
    expect(isInternalAppPath("/app/")).toBe(true);
    expect(isInternalAppPath("/app/secretaria/")).toBe(true);
    expect(isInternalAppPath("/app/#avisos")).toBe(true);
    expect(isInternalAppPath("/eventos/")).toBe(false);
    expect(isInternalAppPath("https://www.youtube.com/@IDBRiachoFundo1")).toBe(false);
    expect(shouldInterceptAppNavigation("/app/secretaria/", click)).toBe(true);
    expect(shouldInterceptAppNavigation("/app/secretaria/", { ...click, metaKey: true })).toBe(false);
    expect(shouldInterceptAppNavigation("/eventos/", click)).toBe(false);
  });

  it("troca a rota no cliente e mede a ida até a página nova", () => {
    const replaced: string[] = [];
    registerAppRouter({ push: () => undefined, replace: href => replaced.push(href) });
    expect(openAuthenticatedArea("/app/secretaria/")).toBe("client");
    expect(replaced).toEqual(["/app/secretaria/"]);
    const sample = finishClientNavigation("/igreja-deus-riacho-fundo-1/app/secretaria/");
    expect(sample).toMatchObject({ href: "/app/secretaria/", client: true });
    expect(sample?.durationMs).toBeGreaterThanOrEqual(0);
    expect(summarizeNavigationTimings().count).toBe(1);
    expect(finishClientNavigation("/app/membros/")).toBeNull();
  });

  it("preserva o basePath do GitHub Pages quando o roteador ainda não hidratou", () => {
    process.env.NEXT_PUBLIC_BASE_PATH = "/igreja-deus-riacho-fundo-1";
    const assigned: string[] = [];
    vi.stubGlobal("window", { location: { assign: (url: string) => assigned.push(url) } });
    expect(openAuthenticatedArea("/app/")).toBe("full-load");
    expect(assigned).toEqual(["/igreja-deus-riacho-fundo-1/app/"]);
  });

  it("não conclui medição de outra rota", () => {
    beginClientNavigation("/app/membros/");
    expect(finishClientNavigation("/igreja-deus-riacho-fundo-1/app/secretaria/")).toBeNull();
    expect(summarizeNavigationTimings().count).toBe(0);
  });
});
