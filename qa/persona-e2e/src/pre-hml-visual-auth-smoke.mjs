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
    const actionBackground = button => button.evaluate(element => getComputedStyle(element).backgroundColor);
    if (await actionBackground(draw) === await actionBackground(publish)) {
      throw new Error(`Gerar e publicar têm o mesmo destaque visual em ${width}px.`);
    }
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

    // Check the real media editor with a synthetic storage response; no file leaves localhost.
    await page.route("**/cms/site-media", async route => {
      if(route.request().method() !== "GET") { await route.abort(); return; }
      await route.fulfill({status:200,contentType:"application/json",headers:{"Access-Control-Allow-Origin":root},body:JSON.stringify({configured:true,assets:[]})});
    });
    await page.goto(root+"/app/site/",{waitUntil:"domcontentloaded"});
    const upload=page.getByRole("button",{name:"Enviar foto",exact:true});
    await upload.waitFor({state:"visible",timeout:20000});
    await page.waitForFunction(()=>Array.from(document.querySelectorAll("button")).some(b=>b.textContent.trim()==="Enviar foto"&&!b.disabled));
    const mediaGeometry=await upload.evaluate(b=>({width:b.getBoundingClientRect().width,height:b.getBoundingClientRect().height,color:getComputedStyle(b).color,background:getComputedStyle(b).backgroundColor,overflow:document.documentElement.scrollWidth>innerWidth+2}));
    if(mediaGeometry.height<43||mediaGeometry.color!=="rgb(255, 255, 255)"||mediaGeometry.overflow) throw new Error("Media upload geometry "+JSON.stringify(mediaGeometry));
    const chooserPromise=page.waitForEvent("filechooser");
    await upload.click();
    await chooserPromise;
    await page.screenshot({path:output+"/midia-"+width+".png",fullPage:false});
    await page.unroute("**/cms/site-media");

    console.log("AUTH VISUAL", width, failures ? "CHECK" : "PASS", JSON.stringify(shell));
    await context.close();
    // Log in through the real member UI in a clean browser session.
    const member = await browser.newContext({viewport:{width,height:930}, locale:"pt-BR",timezoneId:"America/Sao_Paulo"});
    const memberPage = await member.newPage();
    try {
      await memberPage.goto(root + "/login/", {waitUntil:"load"});
      // Wait for LoginScreen's mounted effect before interacting with the hydrated form.
      await memberPage.waitForFunction(() => Boolean(window.__IDBRF_PERF__), {timeout:20000});
      await memberPage.getByLabel("E-mail", {exact:true}).fill("membro.sintetico@example.test");
      await memberPage.getByLabel("Senha", {exact:true}).fill(password);
      const responsePromise = memberPage.waitForResponse(r=>r.request().method()==="POST" && new URL(r.url()).pathname==="/auth/login",{timeout:20000});
      await memberPage.getByRole("button",{name:"Entrar no painel",exact:true}).click();
      const loginResponse=await responsePromise;
      if(!loginResponse.ok()) throw new Error("Login sintético falhou: "+loginResponse.status());
      await memberPage.waitForURL(url => /\\/app\\/?$/.test(url.pathname), {timeout:20000,waitUntil:"domcontentloaded"});
      const next = memberPage.locator('[data-member-next="scheduled"]');
      await next.waitFor({state:"visible",timeout:20000});
      const cta = memberPage.getByRole("link",{name:"Responder à escala"});
      await cta.waitFor({state:"visible"});
      if (!(await memberPage.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2))) {
        failures++; console.error("FAIL: member dashboard overflow",width);
      }
      await memberPage.screenshot({path:output+"/membro-inicio-"+width+".png",fullPage:false});
      if (!(await cta.getAttribute("href"))?.includes("#escala-qa-member-future")) {
        failures++; console.error("FAIL: member assignment target",width);
      }
    } finally { await member.close(); }

  }
} finally {
  await browser.close();
}
if (failures) throw new Error("FAIL: " + failures + " regressões visuais autenticadas sintéticas");
console.log("PASS: todas as capturas de shell e drawer em 1440/768/390/320px (localhost sintético)");
