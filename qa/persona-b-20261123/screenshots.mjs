/**
 * Capturas LOCAL do painel sintético e do bloqueio SSO hospedado.
 * A sessão do navegador usa o access token devolvido por POST /auth/login
 * no API local. O arquivo não grava senha nem token.
 */
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";

const { chromium } = createRequire(new URL("../persona-e2e/package.json", import.meta.url))("playwright");

const out = new URL("../../docs/qa/evidence/persona-b-20261123/", import.meta.url);
const web = process.env.QA_LOCAL_WEB ?? "http://127.0.0.1:3000";
const api = process.env.QA_LOCAL_API ?? "http://127.0.0.1:3011";
const password = process.env.QA_DEMO_PASSWORD;
if (!password) throw new Error("QA_DEMO_PASSWORD ausente");

const shots = [
  ["tesouraria", "tesouraria.demo@example.test", "/app/tesouraria/#despesas"],
  ["pastor", "pastor.demo@example.test", "/app/pastoral/despesas/"],
  ["louvor", "qa-persona-b-20261123-louvor@example.test", "/app/servir/louvor/"],
  ["atmosfera", "qa-persona-b-20261123-atmosfera@example.test", "/app/servir/atmosfera/"],
  ["modulo", "qa-persona-b-20261123-modulo@example.test", "/app/servir/atmosfera/"],
  ["membro-tesouraria", "bruno.demo@example.test", "/app/tesouraria/"],
];

async function login(email) {
  const response = await fetch(`${api}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (response.status !== 201) throw new Error(`login local HTTP ${response.status}`);
  const body = await response.json();
  if (typeof body.accessToken !== "string") throw new Error("login local sem sessão");
  return body.accessToken;
}

await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const hosted = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const gate = await hosted.newPage();
  await gate.goto("https://id-riacho1-web-hml-git-0d6b26-gustavomarqueslopes-cmds-projects.vercel.app/", { waitUntil: "domcontentloaded", timeout: 30000 });
  await gate.waitForTimeout(1000);
  await gate.screenshot({ path: new URL("hosted-sso-1440.png", out).pathname });
  await hosted.close();

  const loginContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const loginPage = await loginContext.newPage();
  await loginPage.goto(`${web}/login/`, { waitUntil: "domcontentloaded" });
  await loginPage.locator("#church-email").waitFor({ state: "visible" });
  await loginPage.screenshot({ path: new URL("local-login-1440.png", out).pathname });
  await loginContext.close();

  for (const [name, email, path] of shots) {
    const token = await login(email);
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
      await context.addInitScript((value) => {
        window.sessionStorage.setItem("idbrf_demo_token", value);
      }, token);
      const view = await context.newPage();
      await view.goto(`${web}${path}`, { waitUntil: "domcontentloaded" });
      await view.waitForTimeout(1800);
      const file = `${name}-${width}.png`;
      await view.screenshot({ path: new URL(file, out).pathname, fullPage: false });
      const text = (await view.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 180);
      console.error(`saved ${file} url=${view.url()} text=${text}`);
      await context.close();
    }
  }
} finally {
  await browser.close();
}
