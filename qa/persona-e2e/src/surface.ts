import fs from "node:fs";
import { fileURLToPath } from "node:url";
import type { APIRequestContext, Page } from "@playwright/test";

export type Surface = "login-gate" | "hml-login" | "operational" | "unknown";

const OPERATIONAL_MARKERS = [
  "Protocolos de admissão",
  "PAINEL DE PROTOCOLOS",
  "Diretório de membros",
  "Sua comunidade",
  "Pessoas fazem a",
  "Uma jornada de",
  "Admissões e secretaria",
  "Abrir protocolo fictício",
  "Carteirinhas digitais",
  "Uma plataforma.",
  "Gestão do site",
  "Textos e fotos",
  "Nenhuma área habilitada para este perfil",
  "Conectado como",
  "Pessoas e famílias",
  "Painel HML",
];

export async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded");
  const candidates = [
    page.getByRole("heading", { name: "Entre na sua conta." }),
    page.getByRole("heading", { name: "Entre no ID Riacho 1" }),
    page.getByRole("heading", { name: "Pessoas e famílias" }),
    page.getByRole("heading", { name: "Admissões e secretaria" }),
    page.getByRole("heading", { name: /Painel HML/ }),
    page.getByRole("heading", { name: /Uma plataforma/ }),
  ];
  await Promise.any(
    candidates.map((locator) => locator.waitFor({ state: "visible", timeout: 15_000 })),
  ).catch(() => undefined);
  const checking = page.getByRole("heading", { name: "Verificando seu acesso…" });
  if ((await checking.count()) > 0) {
    await checking.waitFor({ state: "hidden", timeout: 15_000 }).catch(() => undefined);
  }
}

export async function classify(page: Page): Promise<{ surface: Surface; markers: string[] }> {
  await settle(page);
  const text = await page.locator("body").innerText().catch(() => "");
  const loginCopy = /Entre na sua conta/.test(text);
  const publicationLock = /acesso autenticado ainda não está habilitado/.test(text);
  const hmlLogin = /Entrar na homologação|AMBIENTE DE HOMOLOGAÇÃO/.test(text);
  const markers = OPERATIONAL_MARKERS.filter((marker) => text.includes(marker));
  const loginForm = (await page.locator("#church-email").count()) > 0;
  if (markers.length > 0 && !loginForm && !hmlLogin) {
    return { surface: "operational", markers };
  }
  if (publicationLock || (loginCopy && loginForm)) return { surface: "login-gate", markers };
  if (hmlLogin || loginCopy) return { surface: "hml-login", markers };
  if (markers.length > 0) return { surface: "operational", markers };
  return { surface: "unknown", markers };
}

export async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

export async function navigationTiming(page: Page): Promise<number | undefined> {
  return page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (!nav) return undefined;
    return Math.round(nav.duration);
  });
}

export async function isReachable(request: APIRequestContext, url: string): Promise<boolean> {
  try {
    const response = await request.get(url, { timeout: 8_000 });
    return response.status() < 500;
  } catch {
    return false;
  }
}

export async function shot(page: Page, name: string): Promise<string> {
  const relative = `reports/evidence/${name}.png`;
  const file = fileURLToPath(new URL(`../${relative}`, import.meta.url));
  fs.mkdirSync(fileURLToPath(new URL("../reports/evidence/", import.meta.url)), { recursive: true });
  await page.screenshot({ path: file, fullPage: false });
  return relative;
}
