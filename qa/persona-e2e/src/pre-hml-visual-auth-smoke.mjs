/**
 * Smoke visual sintético. Não substitui E2E autenticado no DEV hospedado:
 * - opera exclusivamente em 127.0.0.1, com API fake e e-mails @example.test;
 * - verifica a renderização real do shell, drawer mobile e overflow;
 * - não fotografa conteúdo pessoal nem tokens.
 */
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const root = process.env.QA_VISUAL_WEB_URL || "http://127.0.0.1:3000";
const api = process.env.QA_VISUAL_API_URL || "http://127.0.0.1:4010";
const password = process.env.STUB_PASSWORD;
const expectedOrigins = new Set(["http://127.0.0.1:3000", "http://localhost:3000"]);
if (!expectedOrigins.has(root) || !/^http:\/\/(127\.0\.0\.1|localhost):4010$/.test(api)) {
  throw new Error("Visual QA deve executar somente em loopback.");
}
if (!password || password.length < 16) throw new Error("Senha sintética ausente.");
const output = process.env.QA_VISUAL_OUT || "qa-visual-auth-screenshots";
await mkdir(output, { recursive: true });

async function loginSynthetic(email) {
  const response = await fetch(api + "/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error("Falha no login sintético: " + response.status);
  const result = await response.json();
  if (typeof result.accessToken !== "string") throw new Error("Stub não retornou sessão.");
  return result.accessToken;
}

const token = await loginSynthetic("admin.sintetico@example.test");
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
let failures = 0;
try {
  for (const width of [1440, 768, 390, 320]) {
    const context = await browser.newContext({
      viewport: { width, height: 930 },
      locale: "pt-BR",
      timezoneId: "America/Sao_Paulo",
    });
    await context.addInitScript(value => {
      window.sessionStorage.setItem("idbrf_demo_token", value);
    }, token);
    const page = await context.newPage();
    await page.goto(root + "/app/", { waitUntil: "domcontentloaded" });
    // O painel troca a sidebar desktop pela navegação inferior até 970px.
    const nav = page.getByRole("navigation", {
      name: width <= 970 ? "Navegação principal no celular" : "Módulos",
    });
    try {
      await nav.waitFor({ state: "attached", timeout: 12000 });
    } catch (error) {
      await page.screenshot({ path: output + "/debug-auth-" + width + ".png", fullPage: false });
      const snapshot = await page.evaluate(() => ({
        pathname: window.location.pathname,
        title: document.title,
        body: (document.body?.innerText ?? "").slice(0, 1600),
        main: Boolean(document.querySelector("main")),
        sessionPresent: Boolean(window.sessionStorage.getItem("idbrf_demo_token")),
      }));
      console.error("BLOCKED: shell sintético não renderizou", width, JSON.stringify(snapshot));
      throw error;
    }
    await page.waitForTimeout(1100);
    const shell = await page.evaluate(() => ({
      width: window.innerWidth,
      scroll: document.documentElement.scrollWidth,
      heading: document.querySelector("header")?.textContent?.slice(0, 80) ?? "",
      denied: Boolean(document.querySelector("[data-nav-denied]")),
    }));
    if (shell.denied || shell.scroll > shell.width + 2) {
      failures++;
      console.error("FAIL: shell/overflow", width, JSON.stringify(shell));
    }
    await page.screenshot({ path: output + "/admin-shell-" + width + ".png", fullPage: false });

    if (width <= 390) {
      const button = page.getByRole("button", { name: "Abrir menu" }).first();
      await button.waitFor({ state: "visible", timeout: 5000 });
      const box = await button.boundingBox();
      if (!box || box.width < 43 || box.height < 43) {
        failures++;
        console.error("FAIL: alvo de menu pequeno ou ausente", width, JSON.stringify(box));
      }
      await button.click();
      const drawer = page.locator("[data-drawer]");
      if ((await drawer.getAttribute("data-drawer")) !== "open") {
        failures++;
        console.error("FAIL: gaveta não abriu", width);
      }
      await page.screenshot({ path: output + "/admin-drawer-" + width + ".png", fullPage: false });
      const close = page.locator("#app-navigation-rail").getByRole("button", { name: "Fechar", exact: true });
      await close.waitFor({ state: "visible", timeout: 5000 });
      await close.click();
      const newState = await drawer.getAttribute("data-drawer");
      if (newState !== "closed") {
        failures++;
        console.error("FAIL: gaveta não fechou", width);
      }
    }
    // Exercise the actual authenticated ministry route, not just the shell.
    await page.goto(root + "/app/ministerios/?ministry=qa-visual-louvor&aba=escalas", { waitUntil: "domcontentloaded" });
    const toolbar = page.locator("[data-roster-toolbar]");
    await toolbar.waitFor({ state: "visible", timeout: 20000 });
    const create = toolbar.getByRole("button", { name: "Nova escala", exact: true });
    const draw = toolbar.getByRole("button", { name: "Sortear escala do mês", exact: true });
    const publish = toolbar.getByRole("button", { name: "Publicar escala do mês", exact: true });
    await Promise.all([create.waitFor(), draw.waitFor(), publish.waitFor()]);
    const boxes = await Promise.all([create.boundingBox(), draw.boundingBox(), publish.boundingBox()]);
    const toolbarBox = await toolbar.boundingBox();
    const contained = toolbarBox && boxes.every(box => box && box.height >= 43 &&
      box.x >= toolbarBox.x - 2 && box.x + box.width <= toolbarBox.x + toolbarBox.width + 2);
    const sameRow = width !== 1440 || (boxes.every(Boolean) && Math.max(...boxes.map(box => box.y)) - Math.min(...boxes.map(box => box.y)) <= 3);
    const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2);
    if (!contained || !sameRow || !noOverflow) {
      failures++;
      console.error("FAIL: roster toolbar layout", width, JSON.stringify({ boxes, toolbarBox, contained, sameRow, noOverflow }));
    }
    await page.screenshot({ path: output + "/louvor-escalas-" + width + ".png", fullPage: false });
    await create.click();
    await toolbar.getByLabel("Nome do culto").waitFor({ state: "visible" });
    const formFits = await toolbar.locator("form").evaluate(form => form.scrollWidth <= form.clientWidth + 2);
    if (!formFits) {
      failures++;
      console.error("FAIL: expanded roster form overflow", width);
    }
    await page.screenshot({ path: output + "/louvor-nova-escala-" + width + ".png", fullPage: false });
    await create.click();
    await toolbar.getByLabel("Nome do culto").waitFor({ state: "hidden" });
    console.log("ROSTER VISUAL", width, JSON.stringify({ contained, sameRow, noOverflow, formFits }));

    // CMS photo flow: real click -> file chooser -> authorization modal -> multipart POST.
    // Intercept ONLY the loopback API in this synthetic context, never actual storage.
    let mediaConfigured = false;
    let uploaded = false;
    let uploadCount = 0;
    const photoUrl = "/images/riacho/louvor.webp";
    const asset = { url: photoUrl, pathname: "qa/photo.png", name: "Foto sintética", size: 68, uploadedAt: "2026-11-24T12:00:00Z" };
    const cors = { "Access-Control-Allow-Origin": root, "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
    await page.route(api + "/cms/site-layout", async route => {
      if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
      return route.fulfill({ status: 200, headers: cors, json: {
        draft: { version: 1, hero: { title: "Igreja", accent: "Riacho", description: "Uma igreja para Deus", imageUrl: "/images/capa-igreja-riacho-fundo.jpg" },
          gallery: { title: "Galeria", accent: "Fotos", description: "Registros", items: [{ title: "Foto", subtitle: "Culto", alt: "Foto de teste", imageUrl: "/images/fachada-igreja-riacho-fundo.jpg" }] },
          appearance: "dourado", sections: ["essencia","ministerios","galeria","atmosfera","visita","acontece","videos","convite"], hidden: [] },
        published: null, draftUpdatedAt: null, publishedAt: null, revisions: [], permissions: { canPublish: true },
      }});
    });
    await page.route(api + "/cms/site-media", async route => {
      const request = route.request();
      if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
      if (request.method() === "POST") {
        uploadCount++;
        if (!(request.headers()["content-type"] ?? "").startsWith("multipart/form-data") || !request.postDataBuffer()?.includes(Buffer.from("qa-photo.png"))) {
          return route.fulfill({ status: 400, headers: cors, json: { message: "Arquivo multipart ausente" } });
        }
        uploaded = true;
        return route.fulfill({ status: 201, headers: cors, json: { asset, configured: true } });
      }
      return route.fulfill({ status: 200, headers: cors, json: { configured: mediaConfigured, assets: uploaded ? [asset] : [] } });
    });
    await page.goto(root + "/app/site/", { waitUntil: "domcontentloaded" });
    const uploadButton = page.getByRole("button", { name: "+ Enviar foto", exact: true });
    await page.getByText("O envio de fotos está indisponível neste momento.", { exact: false }).waitFor();
    await uploadButton.click();
    await page.getByRole("heading", { name: "Envio indisponível" }).waitFor();
    await page.getByRole("button", { name: "Entendi", exact: true }).click();
    mediaConfigured = true;
    await page.getByRole("button", { name: "Atualizar biblioteca", exact: true }).click();
    await page.getByRole("button", { name: "Atualizar biblioteca", exact: true }).waitFor({ state: "hidden" });
    const image = { name: "qa-photo.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=", "base64") };
    const chooser = page.waitForEvent("filechooser");
    await uploadButton.click();
    await (await chooser).setFiles(image);
    await page.getByRole("heading", { name: "Enviar foto à biblioteca pública?" }).waitFor();
    await page.getByRole("button", { name: "Voltar à biblioteca", exact: true }).click();
    if (uploadCount !== 0) throw new Error("Upload ocorreu sem confirmação");
    const chooserAgain = page.waitForEvent("filechooser");
    await uploadButton.click();
    await (await chooserAgain).setFiles(image);
    await page.getByRole("dialog", { name: "Enviar foto à biblioteca pública?" }).getByRole("button", { name: "Enviar foto", exact: true }).click();
    await page.getByRole("heading", { name: "Foto enviada", exact: true }).waitFor();
    await page.getByRole("button", { name: "Entendi", exact: true }).click();
    await page.getByRole("button", { name: /Foto sintética/ }).waitFor();
    if (uploadCount !== 1) throw new Error("Upload duplicado ou ausente");
    await page.screenshot({ path: output + "/cms-photo-" + width + ".png", fullPage: false });
    console.log("CMS PHOTO PASS (API sintética)", width, "chooser, aviso, retry, cancelamento, multipart e sucesso");

    console.log("AUTH VISUAL", width, failures ? "CHECK" : "PASS", JSON.stringify(shell));
    await context.close();
  }
} finally {
  await browser.close();
}
if (failures) throw new Error("FAIL: " + failures + " regressões visuais autenticadas sintéticas");
console.log("PASS: todas as capturas de shell e drawer em 1440/768/390/320px (localhost sintético)");
