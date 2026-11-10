import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  API_URL,
  CHECKS,
  PAGES_URL,
  PERSONAS,
  PROTECTED_GETS,
  SURFACES,
  VIEWPORTS,
  checkById,
} from "./catalog.mjs";
import { contrastMinimum, contrastRatio, rgbToHex } from "./contrast.mjs";
import { renderFindings, renderMatrix, renderRoutes } from "./report.mjs";
import {
  anonymousStatusVerdict,
  applyUserModeRule,
  jargonHits,
  missingChecks,
  normalizeRow,
  publicNavVerdict,
  releaseDecision,
  treasuryPresentation,
  userModeHttpLeak,
} from "./verdict.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const reportDir = join(here, "../reports");
const evidenceDir = join(here, "../evidence");

const pagesBase = (process.env.QA_PAGES_URL || PAGES_URL).replace(/\/$/, "");
const apiBase = (process.env.QA_API_BASE_URL || API_URL).replace(/\/$/, "");

const SHOT_SURFACES = new Set(["home", "painel", "carteirinha", "ministerios-publicos", "homens", "login", "tesouraria"]);
const SHOT_WIDTHS = new Set([320, 390, 768, 1440]);
const EXTRA_SHOTS = new Set(["home", "painel"]);

function pageUrl(path) {
  return `${pagesBase}${path}`;
}

function demoPassword() {
  return process.env.QA_DEMO_PASSWORD?.trim() || "admin";
}

function gitSha() {
  try {
    return execSync("git rev-parse HEAD", { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return "desconhecido";
  }
}

async function callApi(path, { method = "GET", token, body } = {}) {
  const headers = { accept: "application/json" };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, text };
}

async function readSurface(page) {
  return page.evaluate(() => {
    const text = (document.body?.innerText || "").replace(/\u00a0/g, " ");
    const titles = [...document.querySelectorAll("[title]")].map((node) => node.getAttribute("title") || "").join("\n");
    const doc = document.documentElement;
    const h1 = [...document.querySelectorAll("h1")].map((node) => node.innerText.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 4);
    const navLabels = [...document.querySelectorAll("nav[aria-label='Navegação do site público'] a, header a[href*='login']")]
      .map((node) => (node.getAttribute("aria-label") || node.textContent || "").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .slice(0, 16);
    const smallControls = [...document.querySelectorAll("button, summary")]
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          name: (node.getAttribute("aria-label") || node.innerText || "").replace(/\s+/g, " ").trim().slice(0, 80),
          w: Math.round(rect.width),
          h: Math.round(rect.height),
        };
      })
      .filter((item) => item.h > 0 && item.h < 44 && item.w > 0)
      .slice(0, 8);
    function parse(color) {
      const match = String(color).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      if (!match) return null;
      const alpha = match[4] === undefined ? 1 : Number(match[4]);
      if (alpha < 0.95) return null;
      return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]) };
    }
    const samples = [];
    const seen = new Set();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    let scanned = 0;
    while ((node = walker.nextNode()) && scanned < 280 && samples.length < 36) {
      const value = node.textContent.replace(/\s+/g, " ").trim();
      if (value.length < 12) continue;
      const element = node.parentElement;
      if (!element) continue;
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const rect = element.getBoundingClientRect();
      if (rect.width < 4 || rect.height < 4) continue;
      scanned += 1;
      const fg = parse(style.color);
      let bg = null;
      let current = element;
      while (current && !bg) {
        bg = parse(getComputedStyle(current).backgroundColor);
        current = current.parentElement;
      }
      if (!fg || !bg) continue;
      let media = false;
      let carrier = element;
      while (carrier && !media) {
        const image = getComputedStyle(carrier).backgroundImage;
        if (image && image !== "none") media = true;
        carrier = carrier.parentElement;
      }
      const point = document.elementsFromPoint(Math.min(rect.left + 8, window.innerWidth - 2), Math.min(rect.top + 8, window.innerHeight - 2));
      if (point.some((node) => node.tagName === "IMG")) media = true;
      if (media) continue;
      const fontSize = Number.parseFloat(style.fontSize);
      const fontWeight = Number.parseInt(style.fontWeight, 10) || 400;
      const key = [fg.r, fg.g, fg.b, bg.r, bg.g, bg.b, fontSize < 24 ? "s" : "l"].join(":");
      if (seen.has(key)) continue;
      seen.add(key);
      samples.push({ text: value.slice(0, 70), color: fg, background: bg, fontSize, fontWeight });
    }
    return {
      title: document.title,
      text: text.slice(0, 14000),
      titles: titles.slice(0, 4000),
      h1,
      navLabels,
      smallControls,
      overflow: doc.scrollWidth > doc.clientWidth + 2,
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      samples,
    };
  });
}

function combinedText(surface) {
  return `${surface?.text || ""}\n${surface?.titles || ""}`;
}

function worstContrasts(surface) {
  const found = [];
  for (const sample of surface?.samples || []) {
    const fg = rgbToHex(sample.color);
    const bg = rgbToHex(sample.background);
    const ratio = contrastRatio(fg, bg);
    const minimum = contrastMinimum(sample.fontSize, sample.fontWeight);
    if (ratio + 0.01 < minimum) {
      found.push({ ratio: Math.round(ratio * 100) / 100, minimum, fg, bg, text: sample.text, fontSize: Math.round(sample.fontSize) });
    }
  }
  return found.sort((a, b) => a.ratio - b.ratio).slice(0, 3);
}

function looksLikeGate(text) {
  return /entre no id riacho|entre na sua conta|e-mail de teste|entrar para continuar|sessão ainda não está|entrar no painel|entrar na homologação/i.test(text);
}

function listsPeople(text) {
  return /abrir ficha/i.test(text);
}

async function shot(page, name) {
  mkdirSync(evidenceDir, { recursive: true });
  const file = `${name}.jpg`;
  await page.screenshot({ path: join(evidenceDir, file), type: "jpeg", quality: 55, animations: "disabled" });
  return `qa-v3/evidence/${file}`;
}

export async function runAudit(browser) {
  const facts = {
    health: null,
    meta: null,
    release: null,
    protected: [],
    logins: [],
    publicMinistries: null,
    outbox: null,
    surfaces: {},
    paletteText: "",
    interactions: {},
    contrasts: {},
    smallTargets: [],
    overflow: [],
    zoom: {},
  };

  facts.health = await callApi("/health").catch((error) => ({ status: 0, text: error.message }));
  facts.meta = await callApi("/meta").catch((error) => ({ status: 0, text: error.message }));
  const releaseResponse = await fetch(`${pagesBase}/release.json`).catch((error) => ({ ok: false, status: 0, error }));
  if (releaseResponse.ok) {
    facts.release = { status: releaseResponse.status, body: await releaseResponse.json() };
  } else {
    facts.release = { status: releaseResponse.status || 0, body: null };
  }

  for (const path of PROTECTED_GETS) {
    const result = await callApi(path).catch((error) => ({ status: 0, text: error.message }));
    facts.protected.push({ path, status: result.status });
  }
  facts.outbox = await callApi("/channels/outbox", { method: "POST", body: {} }).catch((error) => ({ status: 0, text: error.message }));
  const publicMinistries = await callApi("/public/ministries").catch((error) => ({ status: 0, text: error.message }));
  facts.publicMinistries = { status: publicMinistries.status, slugs: [] };
  if (publicMinistries.status >= 200 && publicMinistries.status < 300) {
    try {
      const parsed = JSON.parse(publicMinistries.text);
      const list = Array.isArray(parsed) ? parsed : parsed.ministries || parsed.items || [];
      facts.publicMinistries.slugs = list.map((item) => item.slug || item.name).filter(Boolean).slice(0, 12);
    } catch {
      facts.publicMinistries.slugs = [];
    }
  }

  for (const persona of PERSONAS) {
    const result = await callApi("/auth/login", {
      method: "POST",
      body: { email: persona.email, password: demoPassword() },
    }).catch((error) => ({ status: 0, text: error.message }));
    let roles = [];
    if (result.status === 200 || result.status === 201) {
      try {
        const parsed = JSON.parse(result.text);
        roles = (parsed.user?.grants || []).map((grant) => grant.roleCode).filter(Boolean);
      } catch {
        roles = [];
      }
    }
    facts.logins.push({
      id: persona.id,
      email: persona.email,
      seeded: persona.seeded,
      status: result.status,
      roles,
    });
  }

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(40_000);

  for (const surface of SURFACES) {
    let response = null;
    try {
      response = await page.goto(pageUrl(surface.path), { waitUntil: "domcontentloaded" });
    } catch (error) {
      facts.surfaces[surface.id] = { http: 0, title: error.message, text: "", h1: [], navLabels: [], shot: {} };
      continue;
    }
    await page.waitForTimeout(350);
    const reading = { http: response ? response.status() : 0, shot: {} };
    for (const width of VIEWPORTS) {
      await page.setViewportSize({ width, height: width < 500 ? 780 : 900 });
      await page.waitForTimeout(120);
      const current = await readSurface(page);
      if (current.overflow) facts.overflow.push({ id: surface.id, width, scrollWidth: current.scrollWidth, clientWidth: current.clientWidth });
      if (width === 1440) {
        reading.text = current.text;
        reading.titles = current.titles;
        reading.h1 = current.h1;
        reading.navLabels = current.navLabels;
        reading.smallControls = current.smallControls;
        reading.samples = current.samples;
        reading.title = current.title;
      }
      if ((width === 390 || width === 1440) && current.smallControls?.length) {
        facts.smallTargets.push({ id: `${surface.id}-${width}`, controls: current.smallControls });
      }
      const wideExtra = EXTRA_SHOTS.has(surface.id) && [360, 1024, 1920].includes(width);
      if ((SHOT_SURFACES.has(surface.id) && SHOT_WIDTHS.has(width)) || wideExtra) {
        reading.shot[width] = await shot(page, `antes-${surface.id}-${width}`);
      }
    }
    facts.surfaces[surface.id] = reading;
    if (reading.samples?.length) facts.contrasts[surface.id] = worstContrasts(reading);
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(pageUrl("/app/"), { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);
  const collapse = page.getByRole("button", { name: /recolher|colapsar|ocultar menu|hambúrguer|menu lateral/i });
  facts.interactions.collapseCount = await collapse.count();
  const opener = page.getByRole("button", { name: /Pesquisar e navegar|Mais módulos/i });
  if (await opener.count()) {
    await opener.first().click();
    await page.waitForTimeout(250);
    facts.paletteText = await page.locator("[role='dialog']").innerText().catch(() => "");
    facts.interactions.paletteShot = await shot(page, "depois-palette-1440");
    await page.keyboard.press("Escape");
  }
  const ministryLink = page.getByRole("link", { name: /Ministérios/i });
  facts.interactions.ministryLinks = await ministryLink.count();
  if (facts.interactions.ministryLinks) {
    await ministryLink.first().click({ timeout: 8000 }).catch((error) => {
      facts.interactions.ministryError = String(error.message || error).slice(0, 180);
    });
    await page.waitForTimeout(400);
    const afterMinistry = await readSurface(page);
    facts.interactions.ministryUrl = page.url();
    facts.interactions.ministryText = afterMinistry.text.slice(0, 2500);
    facts.interactions.ministryHasHomens = /homens/i.test(afterMinistry.text);
    facts.interactions.ministryShot = await shot(page, "depois-ministerios-1440");
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(pageUrl("/app/membros/carteirinha/"), { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);
  const more = page.getByRole("button", { name: /Mais módulos/i });
  if (await more.count()) {
    await more.first().click();
    await page.waitForTimeout(200);
  }
  const cardLink = page.getByRole("link", { name: /Carteirinhas/i });
  facts.interactions.cardClicked = false;
  if (await cardLink.count()) {
    facts.interactions.cardClicked = true;
    await cardLink.first().click({ timeout: 5000 }).catch(() => { facts.interactions.cardClicked = false; });
  }
  await page.waitForTimeout(300);
  const card = await readSurface(page);
  facts.interactions.cardText = card.text.slice(0, 2500);
  facts.interactions.cardShot = await shot(page, "depois-carteirinha-390");
  facts.interactions.cardFront = /frente/i.test(card.text) && /verso/i.test(card.text) && !looksLikeGate(card.text);
  const memberLink = page.getByRole("link", { name: /Membros/i });
  if (await memberLink.count()) {
    await memberLink.first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(300);
    facts.interactions.membersShot = await shot(page, "depois-membros-390");
    facts.interactions.membersText = (await readSurface(page)).text.slice(0, 1500);
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(pageUrl("/app/"), { waitUntil: "domcontentloaded" });
  const leave = page.getByRole("button", { name: /Sair|Trocar perfil/i });
  facts.interactions.leaveLabel = (await leave.count()) ? (await leave.first().innerText()) : "";
  if (await leave.count()) {
    await leave.first().click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(500);
    facts.interactions.leaveUrl = page.url();
    facts.interactions.leaveShot = await shot(page, "depois-sair-1440");
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(pageUrl("/"), { waitUntil: "domcontentloaded" });
  const menu = page.getByRole("button", { name: "Abrir menu" }).or(page.locator("summary[aria-label='Abrir menu']"));
  facts.interactions.menuCount = await menu.count();
  if (facts.interactions.menuCount) {
    await menu.first().click();
    await page.waitForTimeout(200);
    facts.interactions.menuOpen = await page.locator("details[open]").count();
    facts.interactions.menuShot = await shot(page, "depois-menu-390");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);
    facts.interactions.menuAfterEscape = await page.locator("details[open]").count();
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(pageUrl("/login/"), { waitUntil: "domcontentloaded" });
  const emailField = page.locator("#church-email");
  if (await emailField.count()) {
    await emailField.fill("qa.sintetico@example.test");
    await page.locator("#church-password").fill("qa-recusada");
    const submit = page.getByRole("button", { name: /Entrar no painel/i });
    if (await submit.isEnabled()) {
      const responsePromise = page.waitForResponse((response) => response.url().includes("/auth/login"), { timeout: 25000 }).catch(() => null);
      await submit.click();
      const response = await responsePromise;
      await page.waitForTimeout(600);
      const alert = page.locator("[role='alert']");
      const alertText = (await alert.count()) ? await alert.first().innerText() : "";
      facts.credential = {
        http: response ? response.status() : 0,
        echoed: alertText.includes("qa-recusada"),
        message: alertText.includes("qa-recusada") ? "" : alertText.slice(0, 240),
        shot: await shot(page, "depois-login-erro-390"),
      };
    }
  }

  for (const [name, path] of [["home", "/"], ["painel", "/app/"]]) {
    await page.setViewportSize({ width: name === "home" ? 1440 : 390, height: 900 });
    await page.goto(pageUrl(path), { waitUntil: "domcontentloaded" });
    await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
    await page.waitForTimeout(200);
    const zoomed = await readSurface(page);
    facts.zoom[name] = { overflow: zoomed.overflow, scrollWidth: zoomed.scrollWidth, clientWidth: zoomed.clientWidth };
    facts.zoom[`${name}Shot`] = await shot(page, `depois-zoom-${name}`);
    await page.evaluate(() => { document.documentElement.style.zoom = ""; });
  }

  await context.close();

  const rows = classify(facts);
  const missing = missingChecks(CHECKS, rows);
  for (const id of missing) {
    const check = checkById(id);
    rows.push(normalizeRow({
      ...check,
      status: "BLOCKED",
      severity: null,
      detail: "O runner não classificou este item.",
      evidence: "",
      steps: "",
    }));
  }
  const ordered = CHECKS.map((check) => rows.find((row) => row.id === check.id)).filter(Boolean);
  const routes = SURFACES.map((surface) => {
    const reading = facts.surfaces[surface.id] || {};
    const text = combinedText(reading);
    return {
      path: surface.path,
      http: reading.http ?? 0,
      gate: looksLikeGate(text),
      people: listsPeople(text),
      jargon: jargonHits(text),
      leaks: userModeHttpLeak(text),
    };
  });
  mkdirSync(reportDir, { recursive: true });
  const meta = {
    generatedAt: new Date().toISOString(),
    pagesUrl: `${pagesBase}/`,
    apiUrl: apiBase,
    pagesSha: facts.release?.body?.sourceSha || "",
    apiSha: safeSha(facts.meta),
    gitSha: gitSha(),
  };
  writeFileSync(join(reportDir, "matriz.md"), renderMatrix(ordered, meta));
  writeFileSync(join(reportDir, "achados-para-integrador-j.md"), renderFindings(ordered, meta));
  writeFileSync(join(reportDir, "rotas.md"), renderRoutes(routes));
  writeFileSync(join(reportDir, "matriz.json"), JSON.stringify({ meta, decision: releaseDecision(ordered), rows: ordered, routes, overflow: facts.overflow, logins: facts.logins.map(({ id, email, seeded, status, roles }) => ({ id, email, seeded, status, roles })) }, null, 2));
  return { complete: missing.length === 0, missing, decision: releaseDecision(ordered), rows: ordered };
}

function safeSha(meta) {
  if (!meta || meta.status !== 200) return "";
  try {
    return JSON.parse(meta.text).sourceSha || "";
  } catch {
    return "";
  }
}

function put(id, status, severity, detail, extra = {}) {
  const check = checkById(id);
  const row = normalizeRow({
    ...check,
    status,
    severity: status === "PASS" ? null : severity,
    detail,
    evidence: extra.evidence || "",
    steps: extra.steps || "",
  });
  const visible = extra.visible || "";
  return applyUserModeRule(row, row.status === "PASS" ? visible : "");
}

function classify(facts) {
  const home = facts.surfaces.home || {};
  const painel = facts.surfaces.painel || {};
  const secretaria = facts.surfaces.secretaria || {};
  const carteirinha = facts.surfaces.carteirinha || {};
  const tesouraria = facts.surfaces.tesouraria || {};
  const homens = facts.surfaces.homens || {};
  const ministerios = facts.surfaces["ministerios-publicos"] || {};
  const login = facts.surfaces.login || {};
  const meu = facts.surfaces["meu-espaco"] || {};
  const editorial = facts.surfaces.editorial || {};
  const internos = facts.surfaces["ministerios-internos"] || {};
  const visibleBundle = [painel, carteirinha, internos, tesouraria, meu, editorial, secretaria]
    .map(combinedText)
    .join("\n");
  const paletteBundle = `${visibleBundle}\n${facts.paletteText}`;
  const homeText = combinedText(home);
  const pagesSha = facts.release?.body?.sourceSha || "";
  const apiSha = safeSha(facts.meta);
  const signed = facts.logins.filter((item) => item.status === 200 || item.status === 201);
  const authBlocked = signed.length === 0;
  const authDetail = authBlocked
    ? `Nenhuma das 8 contas sintéticas autenticou. HTTP: ${facts.logins.map((item) => `${item.id} ${item.seeded ? "" : "(não está no seed) "}${item.status}`).join("; ")}. A senha usada foi a do seed local documentado, uma tentativa por conta. O secret da HML não está neste agente e a senha não foi resetada.`
    : `${signed.length} contas autenticaram. Papéis lidos sem gravar token.`;
  const cardVisible = combinedText(carteirinha) + (facts.interactions.cardText || "");
  const treasury = treasuryPresentation(combinedText(tesouraria));
  const leaks = userModeHttpLeak(paletteBundle);
  const jargon = jargonHits(paletteBundle);
  const nav = publicNavVerdict(simplifyNav(home.navLabels || []));
  const anonymous = anonymousStatusVerdict(facts.protected);
  const contrasts = Object.entries(facts.contrasts).flatMap(([id, items]) => items.map((item) => ({ id, ...item })));
  const overflowDetail = facts.overflow.length
    ? facts.overflow.map((item) => `${item.id}@${item.width} (${item.scrollWidth}>${item.clientWidth})`).join("; ")
    : "Nenhuma superfície medida estourou a largura entre 320 e 1920.";
  const zoomFail = Object.entries(facts.zoom).filter(([, value]) => value && value.overflow);
  const leaveLabel = (facts.interactions.leaveLabel || "").replace(/\s+/g, " ").trim();
  const leaveToLogin = /\/login\/?/.test(facts.interactions.leaveUrl || "");
  const gateOnly = looksLikeGate(combinedText(painel)) && facts.interactions.ministryLinks === 0 && !leaveLabel;

  const rows = [
    put("SG-T01", home.http === 200 && /igreja de deus/i.test(homeText) ? "PASS" : "FAIL", home.http === 200 ? null : "P0", home.http === 200 ? `Home HTTP ${home.http}, título “${home.title}”.` : `Home HTTP ${home.http}.`, { evidence: home.shot?.[1440] || "", steps: `Abrir ${pageUrl("/")}.` }),
    put("SG-T02", nav.status, nav.severity, `${nav.detail} Rótulos lidos: ${(home.navLabels || []).join(", ") || "nenhum"}.`, { evidence: home.shot?.[1440] || "", steps: "No desktop, ler a navegação do site público e o link de Login." }),
    put("SG-T03", facts.health?.status === 200 && /"status":"ok"/.test(facts.health.text) ? "PASS" : "FAIL", facts.health?.status === 200 ? null : "P0", `GET /health HTTP ${facts.health?.status ?? 0}.`, { steps: `GET ${apiBase}/health` }),
    put("SG-T04", pagesSha && pagesSha === apiSha ? "PASS" : "FAIL", pagesSha && pagesSha === apiSha ? null : "P0", pagesSha && pagesSha === apiSha ? `Pages e API estão em ${pagesSha}.` : `Pages “${pagesSha || "ausente"}”; API “${apiSha || "ausente"}”.`, { steps: "Comparar /release.json do Pages com sourceSha de GET /meta." }),
    put("SG-T05", authBlocked ? "BLOCKED" : "PASS", null, authDetail, { steps: "POST /auth/login uma vez por persona sintética. Sem segunda senha e sem reset.", critical: true }),
    put("SG-T06", anonymous.status, anonymous.severity, anonymous.detail, { steps: "GET das rotas protegidas sem cabeçalho Authorization." }),
    put("SG-T07", "BLOCKED", null, authBlocked ? "A matriz 403 por persona não rodou porque o login HML não abriu sessão." : "Login abriu sessão, mas a matriz positiva/403 autenticada fica para a rodada com senha HML confirmada por J. Nenhuma escrita foi feita.", { steps: "Repetir com QA_DEMO_PASSWORD da HML, sem reset." }),
    put("SG-T08", "BLOCKED", null, "A busca de pessoa exige a sessão de Secretaria. O login sintético não abriu."),
    put("SG-T09", "BLOCKED", null, "O ciclo editar e reabrir o mesmo personId não foi executado. Também não houve PATCH: a frente I não reescreve ficha da HML sem rollback combinado com J."),
    put("SG-T10", facts.interactions.cardFront ? "PASS" : "BLOCKED", null, facts.interactions.cardFront ? "A frente da carteirinha apareceu depois do clique." : facts.interactions.cardClicked ? "O clique em Carteirinhas foi feito. A tela continua no gate, sem credencial aberta." : "A rota /app/membros/carteirinha/ mostrou o login. Não havia link Carteirinhas para abrir a credencial.", { evidence: facts.interactions.cardShot || "", steps: "Abrir /app/membros/carteirinha/ em 390 px e procurar Carteirinhas." }),
    put("SG-T11", "BLOCKED", null, "Frente, verso, PDF e QR não foram exercitados com sessão. O gate não mostra esses artefatos.", { evidence: facts.interactions.cardShot || "" }),
    put("SG-T12", "BLOCKED", null, "Nenhuma credencial existente foi revogada. O POST anônimo de revogação não é o fluxo positivo e a HML não deve perder QR sintético nesta rodada."),
    put("SG-T13", "BLOCKED", null, `Sem sessão não há vínculo formal a gravar. A rota interna caiu no gate. Slugs públicos da API: ${facts.publicMinistries?.slugs?.join(", ") || `HTTP ${facts.publicMinistries?.status}`}.`),
    put("SG-T14", "BLOCKED", null, "A escala autenticada não foi criada. Sem sessão, Meu Espaço e o vínculo interno não listam atribuição."),
    put("SG-T15", "BLOCKED", null, looksLikeGate(combinedText(meu)) ? "Meu Espaço pede entrada e não oferece confirmar ou recusar." : "Meu Espaço não mostrou confirmação da própria escala.", { evidence: meu.shot?.[1440] || "" }),
    put("SG-T16", "BLOCKED", null, "Nenhum evento foi criado na HML. A agenda pública foi apenas lida."),
    put("SG-T17", "BLOCKED", null, "Nenhuma inscrição foi enviada."),
    put("SG-T18", "BLOCKED", null, "Nenhum check-in foi registrado."),
    put("SG-T19", "BLOCKED", null, "CSV e PDF de presença não foram gerados. Não há sessão de gestão de evento nesta execução."),
    put("SG-T20", "BLOCKED", null, looksLikeGate(combinedText(editorial)) ? "O estúdio pede sessão e o rascunho não foi salvo." : "O estúdio não concluiu um rascunho persistido."),
    put("SG-T21", "BLOCKED", null, "Editor e publicador não autenticaram. A conta PUBLICADOR_SITE não está no seed versionado."),
    put("SG-T22", "BLOCKED", null, /idempot/i.test(combinedText(tesouraria)) ? "A tela expõe a chave de idempotência, mas nenhum lançamento foi gravado." : "A rota /app/tesouraria/ caiu no login. Nenhum lançamento foi gravado e a dupla submissão não foi executada.", { evidence: tesouraria.shot?.[1440] || "", steps: "Abrir /app/tesouraria/ sem sessão e não enviar formulário." }),
    put("SG-T23", authBlocked ? "BLOCKED" : "BLOCKED", null, "O 403 de tesouraria por persona fica bloqueado junto com o login. O GET anônimo de /ledger/accounts está em SG-T06."),
    put("SG-T24", externalSend(paletteBundle, facts.outbox), externalSeverity(paletteBundle, facts.outbox), externalDetail(paletteBundle, facts.outbox), { steps: "Ler botões visíveis e fazer POST /channels/outbox sem sessão, com corpo vazio." }),
    put("SG-T25", treasury.status === "FAIL" ? "FAIL" : "BLOCKED", treasury.status === "FAIL" ? "P1" : null, treasury.status === "FAIL" ? treasury.detail : "O painel autenticado com números da API não abriu. A tesouraria sem sessão não consulta o ledger.", { evidence: tesouraria.shot?.[1440] || painel.shot?.[1440] || "", steps: "Abrir /app/ e /app/tesouraria/." }),
    put("SG-T26", leaveToLogin ? "PASS" : gateOnly ? "BLOCKED" : "FAIL", leaveToLogin || gateOnly ? null : "P1", leaveLabel ? `O controle visível é “${leaveLabel}”. Depois do clique a URL ficou ${facts.interactions.leaveUrl || "a mesma"}.` : gateOnly ? "O gate de login cobre /app/ antes do shell. Sair não foi exibido e a sessão não existia." : "Não há botão Sair nem Trocar perfil no shell.", { evidence: facts.interactions.leaveShot || painel.shot?.[1440] || "", steps: "Abrir /app/ sem sessão e procurar Sair." }),
  ];

  rows.push(
    contrastRow("UX-01", "home", facts, home),
    pageRow("UX-02", "quem-somos", facts, "Quem somos carregou."),
    contrastRow("UX-03", "agenda", facts, facts.surfaces.agenda || {}),
    put("UX-04", login.http === 200 && /e-mail/i.test(combinedText(login)) && /senha/i.test(combinedText(login)) ? "PASS" : "FAIL", login.http === 200 ? null : "P1", `Login HTTP ${login.http}. ${/ainda não está habilitado/i.test(combinedText(login)) ? "A publicação avisa que o acesso autenticado está desligado." : "E-mail e senha estão na tela."}`, { evidence: login.shot?.[390] || "", steps: "Abrir /login/." }),
    put("UX-05", secretaria.http === 200 && looksLikeGate(combinedText(secretaria)) && !listsPeople(combinedText(secretaria)) ? "PASS" : listsPeople(combinedText(secretaria)) ? "FAIL" : "FAIL", listsPeople(combinedText(secretaria)) ? "P0" : "P1", listsPeople(combinedText(secretaria)) ? "A secretaria sem sessão lista fichas." : looksLikeGate(combinedText(secretaria)) ? "Sem sessão, /app/secretaria/ mostra o acesso e não a lista." : `A secretaria respondeu HTTP ${secretaria.http} sem o gate esperado.`, { evidence: secretaria.shot?.[1440] || "", steps: "Abrir /app/secretaria/ em janela sem sessão." }),
    put("UX-06", !facts.credential ? "BLOCKED" : facts.credential.echoed ? "FAIL" : facts.credential.message ? "PASS" : facts.credential.http ? "FAIL" : "BLOCKED", facts.credential?.echoed ? "P0" : facts.credential?.message || !facts.credential?.http ? null : "P1", !facts.credential ? "O formulário de login publicado não expôs os campos esperados." : facts.credential.echoed ? "O alerta devolveu a senha digitada." : facts.credential.message ? `O alerta não devolve a senha. HTTP ${facts.credential.http}. Mensagem: ${facts.credential.message}` : facts.credential.http ? `O login respondeu HTTP ${facts.credential.http} e a tela não mostrou alerta.` : "O navegador não recebeu resposta de /auth/login no tempo da prova.", { evidence: facts.credential?.shot || "", steps: "Em /login/, enviar uma conta sintética inexistente e ler o alerta." }),
  );

  const uxv = [
    put("UX-V01", facts.interactions.collapseCount > 0 ? "PASS" : gateOnly ? "BLOCKED" : "FAIL", facts.interactions.collapseCount > 0 || gateOnly ? null : "P1", facts.interactions.collapseCount > 0 ? "Há controle de recolher a sidebar." : gateOnly ? "Sem sessão, /app/ mostra só o login. A sidebar não foi renderizada, então recolher, persistir e expandir não foram executados." : "O shell de /app/ não oferece recolher, persistir ou expandir a sidebar.", { evidence: painel.shot?.[390] || "", steps: "Abrir /app/ sem sessão e, se o shell aparecer, procurar o controle de recolher." }),
    put("UX-V02", facts.interactions.ministryHasHomens ? "PASS" : gateOnly ? "BLOCKED" : "FAIL", facts.interactions.ministryHasHomens || gateOnly ? null : "P1", facts.interactions.ministryHasHomens ? "O clique em Ministérios mostrou Homens." : gateOnly ? `O submenu autenticado não apareceu porque o gate cobre /app/. A página pública /ministerios/homens/ respondeu HTTP ${homens.http}. API pública: ${facts.publicMinistries?.slugs?.join(", ") || "sem slugs"}.` : `O clique em Ministérios não abriu Homens. URL: ${facts.interactions.ministryUrl || "sem navegação"}.`, { evidence: homens.shot?.[390] || "", steps: "Sem sessão, abrir /app/ e também /ministerios/homens/." }),
    put("UX-V03", leaveLabel === "Sair" && leaveToLogin ? "PASS" : gateOnly ? "BLOCKED" : "FAIL", leaveLabel === "Sair" || gateOnly ? null : "P1", leaveLabel === "Sair" && leaveToLogin ? "Sair encerrou na tela de login." : gateOnly ? "O controle Sair fica no shell, que o gate não mostra sem sessão." : leaveLabel ? `O controle visível é “${leaveLabel.trim()}”.` : "O shell não mostra Sair.", { evidence: painel.shot?.[1440] || "", steps: "Abrir /app/ sem sessão e procurar Sair." }),
    put("UX-V04", /canais de comunicação/i.test(paletteBundle) ? "FAIL" : "PASS", /canais de comunicação/i.test(paletteBundle) ? "P1" : null, /canais de comunicação/i.test(paletteBundle) ? "“Canais de Comunicação” aparece no menu." : "“Canais de Comunicação” não aparece no menu principal nem na busca de módulos.", { evidence: facts.interactions.paletteShot || "" }),
    put("UX-V05", jargon.length ? "FAIL" : "PASS", jargon.length ? "P1" : null, jargon.length ? `Jargão visível no que foi aberto: ${jargon.join(", ")}.` : "O portal e o gate de /app/ não mostram demo, roster, endpoint ou schema. O shell atrás do login não entrou na amostra.", { evidence: painel.shot?.[1440] || "", steps: "Ler o texto visível de /app/ sem sessão." }),
    put("UX-V06", hmlVerdict(combinedText(painel)).status, gateOnly && hmlVerdict(combinedText(painel)).status === "FAIL" ? "P2" : hmlVerdict(combinedText(painel)).severity, gateOnly ? "A tela que substitui /app/* não identifica a homologação." : hmlVerdict(combinedText(painel)).detail, { evidence: painel.shot?.[390] || "" }),
    put("UX-V07", "BLOCKED", null, facts.interactions.cardClicked ? "O clique não abriu a frente da carteirinha." : "Não havia carteirinha para abrir: /app/membros/carteirinha/ exibiu só o login.", { evidence: facts.interactions.cardShot || "" }),
    put("UX-V08", "BLOCKED", null, "O verso não foi exibido."),
    put("UX-V09", "BLOCKED", null, "O PDF não foi baixado."),
    put("UX-V10", "BLOCKED", null, "O QR não foi exibido."),
    put("UX-V11", treasury.status, treasury.severity, `${treasury.detail} O painel /app/ está no gate e não mostra indicador numérico da API.`, { evidence: tesouraria.shot?.[1440] || "", steps: "Abrir /app/tesouraria/ sem sessão e ler medidas e ilustração." }),
    put("UX-V12", facts.overflow.length ? "FAIL" : "PASS", facts.overflow.length ? "P2" : null, overflowDetail, { evidence: home.shot?.[320] || "" }),
    put("UX-V13", facts.smallTargets.length ? "FAIL" : "PASS", facts.smallTargets.length ? "P2" : null, facts.smallTargets.length ? `Controles abaixo de 44 px: ${facts.smallTargets.flatMap((item) => item.controls.map((control) => `${item.id} “${control.name}” ${control.h}px`)).slice(0, 6).join("; ")}.` : "Os botões medidos têm pelo menos 44 px de altura.", { evidence: home.shot?.[390] || "" }),
    put("UX-V14", contrasts.length ? "FAIL" : "PASS", contrasts.length ? contrastSeverity(contrasts[0]) : null, contrasts.length ? `Pior contraste fora de fotos: ${contrasts[0].id} ${contrasts[0].ratio}:1 (${contrasts[0].fg} sobre ${contrasts[0].bg}) em “${contrasts[0].text}”.` : "As amostras de texto opaco, fora de fotos, ficaram na razão mínima.", { evidence: home.shot?.[1440] || "" }),
    put("UX-V15", zoomFail.length ? "FAIL" : "PASS", zoomFail.length ? "P2" : null, zoomFail.length ? `Zoom 200% estoura em ${zoomFail.map(([name, value]) => `${name} ${value.scrollWidth}>${value.clientWidth}`).join("; ")}.` : "Zoom 200% em Início (1440) e no painel (390) não criou rolagem horizontal.", { evidence: facts.zoom.homeShot || "" }),
    put("UX-V16", facts.interactions.menuOpen > 0 && facts.interactions.menuAfterEscape === 0 ? "PASS" : "FAIL", "P2", facts.interactions.menuCount ? `Menu móvel aberto=${facts.interactions.menuOpen}; depois do Escape aberto=${facts.interactions.menuAfterEscape}.` : "O botão Abrir menu não apareceu em 390 px.", { evidence: facts.interactions.menuShot || "", steps: "Na home a 390 px, abrir o menu e pressionar Escape." }),
    put("UX-V17", externalSend(paletteBundle, facts.outbox), externalSeverity(paletteBundle, facts.outbox), externalDetail(paletteBundle, facts.outbox)),
    put("UX-V18", leaks.length ? "FAIL" : gateOnly ? "BLOCKED" : "PASS", leaks.length ? "P1" : null, leaks.length ? `O modo usuário mostra ${leaks.join(", ")}.` : gateOnly ? "O gate visível não mostra 404, 501 nem BLOCKED. O shell autenticado, onde esses rótulos podem existir, não foi aberto." : "404, 501 e BLOCKED não aparecem no texto lido.", { evidence: painel.shot?.[1440] || "", steps: "Abrir /app/ sem sessão e ler o texto visível." }),
  ];
  return [...rows, ...uxv];
}

function simplifyNav(labels) {
  return labels.map((label) => label.replace(/Login.*/, "Login").replace(/\s+/g, " ").trim());
}

function contrastSeverity(sample) {
  if (sample.ratio < 3 || sample.text.length > 40) return "P1";
  return "P2";
}

function contrastRow(id, surfaceId, facts, surface) {
  const worst = (facts.contrasts[surfaceId] || [])[0];
  if (!surface.http) return put(id, "BLOCKED", null, "A superfície não foi lida.");
  if (!worst) return put(id, "PASS", null, `${surfaceId} HTTP ${surface.http}. As amostras opacas, fora de fotos, passaram da razão mínima.`, { evidence: surface.shot?.[1440] || surface.shot?.[390] || "" });
  return put(id, "FAIL", contrastSeverity(worst), `${surfaceId} HTTP ${surface.http}. Contraste ${worst.ratio}:1, mínimo ${worst.minimum}, “${worst.text}”.`, { evidence: surface.shot?.[1440] || "" });
}

function pageRow(id, surfaceId, facts, okDetail) {
  const surface = facts.surfaces[surfaceId] || {};
  if (surface.http === 200 && (surface.h1 || []).length) return put(id, "PASS", null, `${okDetail} h1: ${(surface.h1 || []).join(" / ")}.`, { evidence: surface.shot?.[1440] || "" });
  return put(id, "FAIL", "P1", `${surfaceId} HTTP ${surface.http || 0}.`, { evidence: surface.shot?.[1440] || "" });
}

function hmlVerdict(text) {
  const named = /homologa|dados fictícios|dados 100% fict/i.test(text);
  const loud = /fase\s*1|postgresql|nestjs|100% fict/i.test(text);
  if (named && !loud) return { status: "PASS", severity: null, detail: "A homologação aparece sem a faixa técnica de Fase 1 ou de stack." };
  if (named && loud) return { status: "FAIL", severity: "P2", detail: "A homologação está identificada, mas a faixa repete Fase 1, stack ou “100% fictícios”." };
  return { status: "FAIL", severity: "P1", detail: "A área interna não identifica a homologação." };
}

function externalSend(text, outbox) {
  if (outbox && outbox.status >= 200 && outbox.status < 300) return "FAIL";
  if (/whatsapp|enviar mensagem|pagar com pix|gerar pix/i.test(text)) return "FAIL";
  if (outbox && outbox.status !== 401 && outbox.status !== 403) return "FAIL";
  return "PASS";
}

function externalSeverity(text, outbox) {
  return externalSend(text, outbox) === "PASS" ? null : "P0";
}

function externalDetail(text, outbox) {
  if (outbox && outbox.status >= 200 && outbox.status < 300) return `POST /channels/outbox sem sessão respondeu ${outbox.status}.`;
  if (/whatsapp|enviar mensagem|pagar com pix|gerar pix/i.test(text)) return "Há controle visível de mensagem externa ou Pix.";
  if (outbox && outbox.status !== 401 && outbox.status !== 403) return `POST /channels/outbox sem sessão respondeu ${outbox?.status ?? 0}, não 401.`;
  return `Não há botão de WhatsApp, e-mail externo ou Pix. POST /channels/outbox sem sessão respondeu ${outbox?.status}.`;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
  try {
    const result = await runAudit(browser);
    if (!result.complete) {
      console.error(result.missing.join(","));
      process.exitCode = 1;
    } else {
      console.log(result.decision.label);
    }
  } finally {
    await browser.close();
  }
}
