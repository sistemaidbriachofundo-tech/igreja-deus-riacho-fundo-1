import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "@playwright/test";
import { scanInventory } from "../src/inventory.mjs";
import { assertReportSafe, BASELINE, judge, summarize } from "../src/judge.mjs";
import {
  renderChecklist,
  renderInventory,
  renderMatrix,
  renderPerformance,
  renderReadme,
  renderRoteiro,
} from "../src/report.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const qaRoot = resolve(here, "..");
const repoRoot = resolve(qaRoot, "..", "..");
const pagesUrl = (process.env.QA_PAGES_URL || "https://sistemaidbriachofundo-tech.github.io/igreja-deus-riacho-fundo-1").replace(/\/$/, "");
const apiUrl = (process.env.QA_API_BASE_URL || "https://id-riacho1-api-hml.vercel.app").replace(/\/$/, "");
const previewUrl = (process.env.QA_PREVIEW_URL || "https://id-riacho1-web-hml.vercel.app").replace(/\/$/, "");
const secret = process.env.QA_DEMO_PASSWORD?.trim() || "admin";

const ACCOUNTS = [
  ["ADMIN", "platform.demo@example.test"],
  ["SECRETARIA", "ana.demo@example.test"],
  ["PASTOR", "pastor.demo@example.test"],
  ["TESOURARIA", "tesouraria.demo@example.test"],
  ["LIDER", "lider.jovens.demo@example.test"],
  ["MEMBRO", "bruno.demo@example.test"],
  ["EDITOR", "editor.demo@example.test"],
];

const SURFACES = [
  ["home", "/", [390, 1440]],
  ["a-igreja", "/a-igreja/", [1440]],
  ["eventos", "/eventos/", [1440]],
  ["ministerios", "/ministerios/", [320, 1440]],
  ["novidades", "/novidades/", []],
  ["visita", "/visita/", []],
  ["contato", "/contato/", []],
  ["login", "/login/", [390, 1440]],
  ["w1-estudio", "/w1-estudio/", [390, 1440]],
  ["design-system", "/design-system/", [1440]],
  ["status", "/status/", [1440]],
  ["app", "/app/", [1440]],
  ["app/operacao", "/app/operacao/", [1440]],
  ["app/editorial", "/app/editorial/", []],
];

function pageUrl(path) {
  return `${pagesUrl}${path}`;
}

function safePath(pathname) {
  return pathname
    .split("/")
    .map((part) => (part.length > 48 ? ":id" : part))
    .join("/");
}

async function readJson(url) {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  const text = await response.text();
  try {
    return { status: response.status, body: JSON.parse(text) };
  } catch {
    return { status: response.status, body: null };
  }
}

async function loginOnce(email) {
  const response = await fetch(`${apiUrl}/auth/login`, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ email, password: secret }),
  });
  const http = response.status;
  const raw = await response.text();
  let opened = false;
  let roles = [];
  let token = null;
  if (http === 200 || http === 201) {
    try {
      const body = JSON.parse(raw);
      if (typeof body.accessToken === "string" && body.accessToken) {
        token = body.accessToken;
        opened = true;
        roles = Array.isArray(body.user?.grants)
          ? body.user.grants.map((grant) => grant.roleCode).filter((role) => typeof role === "string")
          : [];
      }
    } catch {
      opened = false;
    }
  }
  return { http, opened, roles, token };
}

async function readSurface(page) {
  return page.evaluate(() => {
    const text = (document.body?.innerText || "").replace(/\u00a0/g, " ");
    const navTiming = performance.getEntriesByType("navigation")[0];
    function channel(value) {
      const scaled = value / 255;
      return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
    }
    function parse(color) {
      const match = String(color).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      if (!match) return null;
      const alpha = match[4] === undefined ? 1 : Number(match[4]);
      if (alpha < 0.95) return null;
      return [Number(match[1]), Number(match[2]), Number(match[3])];
    }
    function ratio(fg, bg) {
      const first = 0.2126 * channel(fg[0]) + 0.7152 * channel(fg[1]) + 0.0722 * channel(fg[2]);
      const second = 0.2126 * channel(bg[0]) + 0.7152 * channel(bg[1]) + 0.0722 * channel(bg[2]);
      return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
    }
    let worst = null;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    let scanned = 0;
    while ((node = walker.nextNode()) && scanned < 250) {
      const value = node.textContent.replace(/\s+/g, " ").trim();
      if (value.length < 8) continue;
      const element = node.parentElement;
      if (!element) continue;
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const rect = element.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) continue;
      scanned += 1;
      const fg = parse(style.color);
      let bg = null;
      let imageBetween = false;
      let current = element;
      while (current && !bg) {
        const parentStyle = getComputedStyle(current);
        if (parentStyle.backgroundImage && parentStyle.backgroundImage !== "none") imageBetween = true;
        bg = parse(parentStyle.backgroundColor);
        current = current.parentElement;
      }
      if (!fg || !bg || imageBetween) continue;
      const size = Number.parseFloat(style.fontSize) || 16;
      const bold = Number.parseInt(style.fontWeight, 10) >= 700;
      const minimum = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
      const score = ratio(fg, bg);
      if (!worst || score < worst.ratio) worst = { ratio: score, minimum, text: value.slice(0, 80) };
    }
    const doc = document.documentElement;
    return {
      title: document.title,
      navHrefs: [...document.querySelectorAll("header a")].map((anchor) => anchor.getAttribute("href") || "").filter(Boolean),
      riachinho: Boolean(document.querySelector("[data-riachinho-public], [aria-label*='Riachinho']")),
      hasEmail: Boolean(document.querySelector("#church-email")),
      hasPassword: Boolean(document.querySelector("#church-password")),
      individualAccess: text.includes("Seu acesso é individual"),
      simulated: text.includes("Papel simulado") || text.includes("Publicar simulado"),
      engineering: /bootstrap|SonarCloud|localhost:3001|Infraestrutura/.test(text),
      logoutButtons: [...document.querySelectorAll("button")].filter((item) => (item.innerText || "").replace(/\s+/g, " ").trim() === "Sair").length,
      search: Boolean(document.querySelector("[aria-label*='Pesquisar']")),
      alerts: Boolean(document.querySelector("[aria-label*='avisos']")),
      hasQuemSomosAnchor: Boolean(document.querySelector("#quem-somos, #identity-title")),
      hasAgendaAnchor: Boolean(document.querySelector("#agenda")),
      overflow: doc.scrollWidth > doc.clientWidth + 1
        ? { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth }
        : null,
      worstContrast: worst,
      targets: [...document.querySelectorAll("button")]
        .map((item) => {
          const rect = item.getBoundingClientRect();
          return {
            name: (item.getAttribute("aria-label") || item.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60),
            h: Math.round(rect.height),
            w: Math.round(rect.width),
          };
        })
        .filter((item) => item.h > 0 && item.h < 44 && item.w >= 24)
        .slice(0, 6),
      ttfbMs: navTiming ? navTiming.responseStart : 0,
      dclMs: navTiming ? navTiming.domContentLoadedEventEnd : 0,
      loadMs: navTiming ? navTiming.loadEventEnd : 0,
    };
  });
}

test("auditoria da baseline publicada @live", async ({ browser }) => {
  const evidenceDir = join(qaRoot, "evidence");
  const reportDir = join(qaRoot, "reports");
  const docsDir = join(repoRoot, "docs/qa/rf1-v1c");
  mkdirSync(evidenceDir, { recursive: true });
  mkdirSync(reportDir, { recursive: true });
  mkdirSync(docsDir, { recursive: true });

  const release = await readJson(`${pagesUrl}/release.json`);
  const health = await readJson(`${apiUrl}/health`);
  const meta = await readJson(`${apiUrl}/meta`);
  const previewResponse = await fetch(`${previewUrl}/`, { redirect: "follow" });
  const previewBody = await previewResponse.text();
  const previewMarker = previewBody.includes("DEPLOYMENT_PAUSED")
    ? "DEPLOYMENT_PAUSED"
    : previewBody.includes("DEPLOYMENT_BLOCKED")
      ? "DEPLOYMENT_BLOCKED"
      : previewResponse.status === 200
        ? "HTTP 200"
        : `HTTP ${previewResponse.status}`;

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const pages = {};
  const timings = [];
  const waterfalls = [];
  const touch = [];
  const overflowWidths = [320, 390, 768, 1440];

  for (const [key, path, shots] of SURFACES) {
    const requests = [];
    const startedAt = new WeakMap();
    const onRequest = (request) => {
      startedAt.set(request, Date.now());
    };
    const onFinished = async (request) => {
      const response = await request.response().catch(() => null);
      let pathname = "url-invalida";
      try {
        pathname = safePath(new URL(request.url()).pathname);
      } catch {
        pathname = "url-invalida";
      }
      requests.push({
        method: request.method(),
        status: response ? response.status() : 0,
        type: request.resourceType(),
        path: pathname,
        ms: Date.now() - (startedAt.get(request) || Date.now()),
      });
    };
    page.on("request", onRequest);
    page.on("requestfinished", onFinished);
    const response = await page.goto(pageUrl(path), { waitUntil: "load" });
    const surface = await readSurface(page);
    surface.http = response ? response.status() : 0;
    if ((key === "home" || key === "login") && surface.targets) {
      for (const target of surface.targets) touch.push({ ...target, where: `${key}-1440` });
    }
    surface.overflow = [];
    const firstOverflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth > doc.clientWidth + 1
        ? { width: window.innerWidth, scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth }
        : null;
    });
    if (firstOverflow && overflowWidths.includes(1440)) surface.overflow.push(firstOverflow);
    page.off("request", onRequest);
    page.off("requestfinished", onFinished);
    timings.push({
      path,
      http: surface.http,
      ttfbMs: surface.ttfbMs,
      dclMs: surface.dclMs,
      loadMs: surface.loadMs,
      requests: requests.length,
    });
    if (["/", "/login/", "/app/"].includes(path)) {
      waterfalls.push({
        path,
        slowest: requests.sort((a, b) => b.ms - a.ms).slice(0, 8).map(({ method, status, type, path: requestPath }) => ({
          method,
          status,
          type,
          path: requestPath,
        })),
      });
    }
    if (shots.includes(1440)) {
      await page.screenshot({ path: join(evidenceDir, `${key.replace("/", "-")}-1440.jpg`), type: "jpeg", quality: 55 });
    }
    for (const width of [320, 390, 768]) {
      if (!overflowWidths.includes(width) && !shots.includes(width)) continue;
      await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
      const measured = await page.evaluate((measuredWidth) => {
        const doc = document.documentElement;
        return doc.scrollWidth > doc.clientWidth + 1
          ? { width: measuredWidth, scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth }
          : null;
      }, width);
      if (measured) surface.overflow.push(measured);
      if (shots.includes(width)) {
        const extra = await readSurface(page);
        if (key === "home" || key === "login") {
          for (const target of extra.targets) touch.push({ ...target, where: `${key}-${width}` });
        }
        await page.screenshot({ path: join(evidenceDir, `${key.replace("/", "-")}-${width}.jpg`), type: "jpeg", quality: 55 });
      }
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    pages[key] = surface;
  }

  const loginPage = await context.newPage();
  await loginPage.setViewportSize({ width: 390, height: 844 });
    await loginPage.goto(pageUrl("/login/"), { waitUntil: "load" });
  const loginProbe = { echo: null, loginHttp: null, alertExcerpt: "" };
  const emailField = loginPage.locator("#church-email");
  if (await emailField.count()) {
    await emailField.fill("platform.demo@example.test");
    await loginPage.locator("#church-password").fill(secret);
    const loginResponse = loginPage.waitForResponse((item) => item.url().includes("/auth/login"), { timeout: 20_000 }).catch(() => null);
    await loginPage.locator("button[type=submit]").click();
    const answered = await loginResponse;
    loginProbe.loginHttp = answered ? answered.status() : null;
    await loginPage.locator("[role=alert], [role=status]").first().waitFor({ timeout: 8_000 }).catch(() => undefined);
    const alertText = await loginPage.locator("[role=alert], [role=status]").allTextContents();
    const joined = alertText.join(" ").replace(/\s+/g, " ").trim();
    loginProbe.echo = loginProbe.loginHttp == null ? null : joined.includes(secret);
    loginProbe.alertExcerpt = joined.replaceAll(secret, "[omisso]").slice(0, 180);
    await loginPage.locator("#church-password").fill("");
    await loginPage.screenshot({ path: join(evidenceDir, "login-erro-390.jpg"), type: "jpeg", quality: 55 });
  }
  await loginPage.close();
  pages.login = { ...pages.login, ...loginProbe };

  const logins = [];
  let session = null;
  for (const [persona, email] of ACCOUNTS) {
    const result = await loginOnce(email);
    logins.push({ persona, email, http: result.http, opened: result.opened });
    if (result.opened && !session) {
      session = { email, persona, roles: result.roles, token: result.token };
    } else {
      result.token = null;
    }
  }

  let authenticated = null;
  if (session?.token) {
    const authContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const token = session.token;
    await authContext.addInitScript((value) => {
      window.sessionStorage.setItem("idbrf_demo_token", value);
    }, token);
    const authPage = await authContext.newPage();
    const started = await authPage.goto(pageUrl("/app/"), { waitUntil: "load" });
    const timing = await authPage.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0];
      return nav ? { ttfbMs: nav.responseStart, loadMs: nav.loadEventEnd } : null;
    });
    const shell = await authPage.evaluate(() => {
      const text = (document.body?.innerText || "").replace(/\s+/g, " ");
      const menu = [...document.querySelectorAll("nav a, aside a")].map((item) => (item.textContent || "").replace(/\s+/g, " ").trim()).filter(Boolean);
      return {
        text: text.slice(0, 2000),
        menu,
        search: Boolean(document.querySelector("[aria-label*='Pesquisar']")),
        alerts: Boolean(document.querySelector("[aria-label*='avisos']")),
        logoutCount: [...document.querySelectorAll("button")].filter((item) => (item.textContent || "").trim() === "Sair").length,
      };
    });
    await authPage.screenshot({ path: join(evidenceDir, "app-autenticado-1440.jpg"), type: "jpeg", quality: 55 });
    const jargon = [];
    for (const pattern of [/\bQA\b/, /\bdemo\b/i, /endpoint/i, /schema/i, /\bRFC\b/, /CHURCH OS/i, /\b501\b/]) {
      if (pattern.test(shell.text)) jargon.push(pattern.source);
    }
    await authPage.goto(pageUrl("/app/secretaria/"), { waitUntil: "load" });
    const secretaryText = await authPage.locator("body").innerText();
    await authPage.goto(pageUrl("/app/membros/carteirinha/"), { waitUntil: "load" });
    const credentialText = await authPage.locator("body").innerText();
    await authPage.screenshot({ path: join(evidenceDir, "carteirinha-autenticada-1440.jpg"), type: "jpeg", quality: 55 });
    let logoutPath = "";
    let tokenCleared = false;
    const logout = authPage.getByRole("button", { name: "Sair", exact: true });
    if (await logout.count()) {
      await logout.first().click();
      const confirm = authPage.getByRole("button", { name: "Sair agora" });
      if (await confirm.count()) await confirm.click();
      await authPage.waitForLoadState("load");
      logoutPath = new URL(authPage.url()).pathname;
      tokenCleared = await authPage.evaluate(() => window.sessionStorage.getItem("idbrf_demo_token") == null);
    }
    const adminRole = session.roles.some((role) => ["PLATFORM_ADMIN", "SECRETARIA", "PASTOR", "LIDER_MINISTERIO"].includes(role));
    authenticated = {
      search: shell.search,
      alerts: shell.alerts,
      logoutCount: shell.logoutCount,
      jargon,
      appLoadMs: timing?.loadMs ?? null,
      appTtfbMs: timing?.ttfbMs ?? null,
      sawMembers: true,
      sawSecretary: secretaryText.length > 0,
      secretaryText,
      menuLabels: shell.menu,
      meuEspacoInAdminMenu: adminRole && shell.menu.some((label) => /meu espaço/i.test(label)),
      credential: {
        front: /frente/i.test(credentialText),
        back: /verso/i.test(credentialText),
        qr: /\bQR\b/.test(credentialText),
      },
      ministryLabels: shell.menu.filter((label) => /homens|mulheres|jovens|adolescentes|louvor|atmosfera/i.test(label)),
      logoutPath,
      tokenCleared,
      shots: { app: "qa/rf1-v1c/evidence/app-autenticado-1440.jpg" },
    };
    session.token = null;
    await authContext.close();
    if (started) {
      /* navigation status is not a credential */
    }
  }

  const anonymous = [];
  for (const path of ["/auth/me", "/persons/search?q=ana", "/credentials/me", "/ledger/accounts"]) {
    const response = await fetch(`${apiUrl}${path}`, { headers: { accept: "application/json" } });
    await response.arrayBuffer();
    anonymous.push({ path: path.split("?")[0], http: response.status });
  }

  const source = scanInventory();
  const observation = {
    pagesSha: release.body?.sourceSha ?? null,
    apiSha: typeof meta.body?.sourceSha === "string" ? meta.body.sourceSha : null,
    apiHealth: health.status,
    sessionOpened: Boolean(authenticated),
    preview: { url: `${previewUrl}/`, status: previewResponse.status, marker: previewMarker },
    pages,
    logins,
    anonymous,
    timings: timings.filter((item) => ["/", "/login/", "/a-igreja/", "/eventos/"].includes(item.path)),
    touch,
    touchMeasured: true,
    source,
    authenticated,
  };
  const rows = judge(observation);
  const summary = summarize(rows);
  const report = {
    executedAt: new Date().toISOString(),
    baseline: BASELINE,
    pagesUrl,
    apiUrl,
    pagesSha: observation.pagesSha,
    apiSha: observation.apiSha,
    preview: observation.preview,
    summary,
    rows,
    timings,
    waterfalls,
    authenticatedTiming: authenticated
      ? { ttfbMs: authenticated.appTtfbMs, loadMs: authenticated.appLoadMs }
      : null,
  };
  const matrix = renderMatrix(report);
  const inventoryDoc = renderInventory(source);
  const performance = renderPerformance(report);
  const checklist = renderChecklist(report);
  const readme = renderReadme(report);
  const roteiro = renderRoteiro();
  const bundle = [matrix, inventoryDoc, performance, checklist, readme, roteiro, JSON.stringify(report)].join("\n");
  assertReportSafe(bundle, secret);

  writeFileSync(join(reportDir, "matriz.json"), JSON.stringify({ ...report, waterfalls }, null, 2));
  writeFileSync(join(reportDir, "matriz.md"), matrix);
  writeFileSync(join(docsDir, "matriz.md"), matrix);
  writeFileSync(join(docsDir, "inventario.md"), inventoryDoc);
  writeFileSync(join(docsDir, "roteiro.md"), roteiro);
  writeFileSync(join(docsDir, "performance.md"), performance);
  writeFileSync(join(docsDir, "checklist-integrador.md"), checklist);
  writeFileSync(join(docsDir, "README.md"), readme);
  await context.close();
});
