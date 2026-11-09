import fs from "node:fs";
import path from "node:path";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const API = (process.env.QA_API_BASE_URL ?? "http://127.0.0.1:3001").replace(/\/$/, "");
const BRUNO = "demoPersonMembro01";
const ANA = "demoPersonRiacho01";
const EVIDENCE = path.resolve(import.meta.dirname, "../reports/evidence");
const REPORT = path.resolve(import.meta.dirname, "../reports/run.json");

type Status = "PASS" | "FAIL" | "BLOCKED";
type Item = {
  id: string;
  persona: string;
  journey: string;
  status: Status;
  ms?: number;
  http?: number;
  detail: string;
  evidence?: string;
  owner: string;
};

const JOURNAL = path.resolve(import.meta.dirname, "../reports/journal.jsonl");

function keep(item: Item): void {
  fs.mkdirSync(path.dirname(JOURNAL), { recursive: true });
  fs.appendFileSync(JOURNAL, `${JSON.stringify(item)}\n`);
}

function readJournal(): Item[] {
  if (!fs.existsSync(JOURNAL)) return [];
  const byId = new Map<string, Item>();
  for (const line of fs.readFileSync(JOURNAL, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const item = JSON.parse(trimmed) as Item;
    byId.set(item.id, item);
  }
  return [...byId.values()];
}

function password(): string {
  return process.env.QA_DEMO_PASSWORD?.trim() || "admin";
}

async function loginApi(
  request: APIRequestContext,
  email: string,
): Promise<{ status: number; token?: string; personId?: string }> {
  const response = await request.post(`${API}/auth/login`, {
    data: { email, password: password() },
    failOnStatusCode: false,
  });
  const status = response.status();
  if (status !== 200 && status !== 201) return { status };
  const body = (await response.json()) as {
    accessToken?: string;
    user?: { personId?: string };
  };
  return { status, token: body.accessToken, personId: body.user?.personId };
}

async function api(
  request: APIRequestContext,
  token: string,
  method: "GET" | "PATCH",
  path: string,
  data?: unknown,
): Promise<{ status: number; body: Record<string, unknown> | null }> {
  const options = {
    headers: { Authorization: `Bearer ${token}` },
    failOnStatusCode: false,
    data,
  };
  const response =
    method === "GET"
      ? await request.get(`${API}${path}`, options)
      : await request.patch(`${API}${path}`, options);
  const status = response.status();
  if (!response.ok()) return { status, body: null };
  return { status, body: (await response.json()) as Record<string, unknown> };
}

async function shot(page: Page, name: string): Promise<string> {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  const file = path.join(EVIDENCE, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return `reports/evidence/${name}.png`;
}

async function openSession(page: Page, token: string, url: string): Promise<void> {
  await page.goto("/login/", { waitUntil: "domcontentloaded" });
  await page.evaluate((value) => {
    window.sessionStorage.setItem("idbrf_demo_token", value);
  }, token);
  await page.goto(url, { waitUntil: "commit" }).catch((error: unknown) => {
    if (!String(error).includes("ERR_ABORTED")) throw error;
  });
  await page.getByLabel("Buscar membros").waitFor({ state: "visible" });
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test.afterAll(() => {
  const items = readJournal();
  const counts = { PASS: 0, FAIL: 0, BLOCKED: 0 };
  for (const item of items) counts[item.status] += 1;
  const report = {
    generatedAt: new Date().toISOString(),
    stack: "postgres-local-sintetico",
    hmlRemote: false,
    counts,
    productApproved: counts.FAIL === 0 && counts.BLOCKED === 0,
    items,
  };
  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);
});

test("fluxo Secretaria buscar, abrir, editar, reabrir e persistir", async ({ page, request }) => {
  const started = Date.now();
  const session = await loginApi(request, "ana.demo@example.test");
  if (!session.token) {
    keep({
      id: "secretaria-fluxo",
      persona: "SECRETARIA",
      journey: "Buscar, abrir, editar e reabrir a ficha",
      status: "BLOCKED",
      http: session.status,
      ms: Date.now() - started,
      detail: `Login sintético da Secretaria respondeu HTTP ${session.status}.`,
      owner: "PR #103 / API local",
    });
    return;
  }

  await page.goto("/login/");
  const cold = Date.now();
  await page.locator("#church-email").fill("ana.demo@example.test");
  await page.locator("#church-password").fill(password());
  await page.getByRole("button", { name: "Entrar no painel" }).click();
  await page.waitForURL(/\/app\//, { timeout: 20_000 });
  await page.waitForFunction(() => window.sessionStorage.getItem("idbrf_demo_token"), null, { timeout: 15_000 });
  const loginMs = Date.now() - cold;
  const runtimeBefore = await page.evaluate(() => {
    const probe = (window as Window & { __IDBRF_PERF__?: { runtimeId?: string } }).__IDBRF_PERF__;
    return probe?.runtimeId ?? null;
  });
  keep({
    id: "login-frio-ui",
    persona: "SECRETARIA",
    journey: "Login frio abre o painel",
    status: /\/app\//.test(page.url()) ? "PASS" : "FAIL",
    ms: loginMs,
    detail: `URL ${page.url()}. runtimeId ${runtimeBefore ?? "ausente"}.`,
    owner: "PR #103",
  });

  await page.goto("/app/membros/");
  const search = page.getByLabel("Buscar membros");
  await search.waitFor({ state: "visible" });
  await search.fill("Bruno");
  const bruno = page.getByText("Bruno Demo Membro");
  const ana = page.getByText("Ana Demo Secretária");
  await expect(bruno.first()).toBeVisible();
  const filtered = (await bruno.count()) > 0 && (await ana.count()) === 0;
  const directoryShot = await shot(page, "diretorio-busca-bruno-1440");
  keep({
    id: "secretaria-buscar-ui",
    persona: "SECRETARIA",
    journey: "Buscar pessoa na interface",
    status: filtered ? "PASS" : "FAIL",
    detail: filtered
      ? "A busca isolou Bruno Demo Membro."
      : "A busca não isolou a pessoa sintética.",
    evidence: directoryShot,
    owner: "PR #106",
  });

  const opener = page.getByRole("button", { name: "Abrir ficha de Bruno Demo Membro" });
  const canOpen = (await opener.count()) === 1;
  keep({
    id: "secretaria-abrir-ui",
    persona: "SECRETARIA",
    journey: "Abrir ficha na interface",
    status: canOpen ? "PASS" : "FAIL",
    detail: canOpen
      ? "O diretório oferece Abrir ficha para a pessoa sintética."
      : "Não há botão Abrir ficha para Bruno.",
    evidence: directoryShot,
    owner: "PR #106",
  });
  if (!canOpen) return;

  const before = await api(request, session.token, "GET", `/persons/${BRUNO}`);
  const originalHousehold =
    before.status === 200 ? ((before.body?.householdId as string | null | undefined) ?? null) : undefined;
  if (originalHousehold === undefined) {
    keep({
      id: "secretaria-editar-ui",
      persona: "SECRETARIA",
      journey: "Editar e reabrir a ficha",
      status: "FAIL",
      http: before.status,
      detail: `GET da ficha antes da edição respondeu HTTP ${before.status}.`,
      owner: "PR #101 / API persons",
    });
    return;
  }

  await opener.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const openShot = await shot(page, "ficha-aberta-1440");
  const family = dialog.getByLabel("Família");
  await expect(family).toBeVisible();
  const options = await family.locator("option").evaluateAll((nodes) =>
    nodes.map((node) => ({ value: (node as HTMLOptionElement).value, label: node.textContent ?? "" })),
  );
  const current = await family.inputValue();
  const alternate = options.find((option) => option.value !== current);
  if (!alternate) {
    keep({
      id: "secretaria-editar-ui",
      persona: "SECRETARIA",
      journey: "Editar família e reabrir",
      status: "BLOCKED",
      detail: "O select de família não tem um segundo valor sintético para gravar.",
      evidence: openShot,
      owner: "seed / PR #106",
    });
    return;
  }

  const editStarted = Date.now();
  await family.selectOption(alternate.value);
  await dialog.getByRole("button", { name: "Salvar campos permitidos" }).click();
  const notice = dialog.getByText("Ficha salva e reaberta com os dados devolvidos pela API.");
  const saveError = dialog.getByText("Falha ao salvar.");
  await expect(notice.or(saveError)).toBeVisible();
  const saved = (await notice.count()) > 0;
  const saveMs = Date.now() - editStarted;
  const savedShot = await shot(page, "ficha-salva-1440");
  if (!saved) {
    const alert = await dialog.getByRole("alert").textContent();
    keep({
      id: "secretaria-editar-ui",
      persona: "SECRETARIA",
      journey: "Salvar campo aceito pelo PATCH",
      status: "FAIL",
      ms: saveMs,
      detail: `A gravação não confirmou a reabertura. Alerta: ${(alert ?? "").slice(0, 180)}`,
      evidence: savedShot,
      owner: "PR #106",
    });
    return;
  }
  await expect(family).toHaveValue(alternate.value);
  await dialog.getByRole("button", { name: "Fechar ficha" }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "Abrir ficha de Bruno Demo Membro" }).click();
  await expect(dialog).toBeVisible();
  const reopenedValue = await dialog.getByLabel("Família").inputValue();
  const uiMatches = reopenedValue === alternate.value;
  const after = await api(request, session.token, "GET", `/persons/${BRUNO}`);
  const apiHousehold = (after.body?.householdId as string | null | undefined) ?? null;
  const expectedApi = alternate.value.length > 0 ? alternate.value : null;
  const apiMatches = after.status === 200 && apiHousehold === expectedApi;
  const reopenShot = await shot(page, "ficha-reaberta-1440");
  keep({
    id: "secretaria-editar-ui",
    persona: "SECRETARIA",
    journey: "Editar família, salvar e ver o valor na ficha",
    status: saved && uiMatches ? "PASS" : "FAIL",
    ms: saveMs,
    detail: `Select após salvar/reabrir: ${reopenedValue || "(sem família)"}.`,
    evidence: reopenShot,
    owner: "PR #106",
  });
  keep({
    id: "secretaria-reabrir-ui",
    persona: "SECRETARIA",
    journey: "Fechar e reabrir a mesma ficha",
    status: uiMatches ? "PASS" : "FAIL",
    detail: uiMatches
      ? "A ficha reaberta mostrou o valor gravado, não só a linha da busca."
      : `Reabertura mostrou ${reopenedValue || "(vazio)"} e o gravado era ${alternate.value || "(vazio)"}.`,
    evidence: reopenShot,
    owner: "PR #106",
  });
  keep({
    id: "secretaria-persistencia-api",
    persona: "SECRETARIA",
    journey: "PATCH de família persiste no Postgres e volta no GET",
    status: apiMatches ? "PASS" : "FAIL",
    http: after.status,
    detail: apiMatches
      ? "GET depois do salvamento devolveu o householdId gravado pela interface."
      : `GET HTTP ${after.status}. Persistência não confere com o valor escolhido.`,
    owner: "API persons / Postgres local",
  });

  const restored = await api(request, session.token, "PATCH", `/persons/${BRUNO}`, {
    householdId: originalHousehold,
  });
  const restoredGet = await api(request, session.token, "GET", `/persons/${BRUNO}`);
  const back = (restoredGet.body?.householdId as string | null | undefined) ?? null;
  keep({
    id: "secretaria-restaurar-seed",
    persona: "SECRETARIA",
    journey: "Restaurar o household sintético original",
    status: restored.status === 200 && back === originalHousehold ? "PASS" : "FAIL",
    http: restored.status,
    detail:
      restored.status === 200 && back === originalHousehold
        ? "O household da pessoa sintética voltou ao valor do seed."
        : `Restauração HTTP ${restored.status}.`,
    owner: "harness",
  });

  await page.keyboard.press("Escape");
  const closed = (await dialog.count()) === 0 || (await dialog.isHidden());
  keep({
    id: "ficha-teclado-escape",
    persona: "SECRETARIA",
    journey: "Escape fecha o diálogo da ficha",
    status: closed ? "PASS" : "FAIL",
    detail: closed ? "Escape dispensou o diálogo." : "Escape não fechou o diálogo.",
    owner: "PR #106",
  });

  const widths = [1440, 768, 360] as const;
  for (const width of widths) {
    await page.setViewportSize({ width, height: width === 360 ? 780 : 900 });
    await page.getByRole("button", { name: "Abrir ficha de Bruno Demo Membro" }).click();
    await expect(dialog).toBeVisible();
    const overflow = await horizontalOverflow(page);
    const buttons = ["Salvar campos permitidos", "Reabrir ficha", "Fechar ficha"];
    const sizes: string[] = [];
    let reachable = true;
    for (const name of buttons) {
      const box = await dialog.getByRole("button", { name }).boundingBox();
      if (!box || box.width < 24 || box.height < 24) reachable = false;
      sizes.push(`${name} ${box ? `${Math.round(box.width)}x${Math.round(box.height)}` : "ausente"}`);
    }
    const titleCovered = await page.evaluate(() => {
      const heading = document.querySelector("[role='dialog'] h2");
      if (!(heading instanceof HTMLElement)) return true;
      const rect = heading.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return true;
      if (rect.top < 0 || rect.bottom > window.innerHeight) return true;
      if (rect.left < -1 || rect.right > window.innerWidth + 1) return true;
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + Math.min(8, rect.height / 2));
      return !hit || (hit !== heading && !heading.contains(hit));
    });
    const evidence = await shot(page, `ficha-${width}`);
    const pass = overflow <= 1 && reachable && !titleCovered;
    keep({
      id: `viewport-${width}`,
      persona: "SECRETARIA",
      journey: `Ficha aberta em ${width}px sem overflow horizontal`,
      status: pass ? "PASS" : "FAIL",
      detail: `overflow ${overflow}px. título ${titleCovered ? "encoberto" : "legível"}. ${sizes.join("; ")}.`,
      evidence,
      owner: "PR #106 / PR #102 não cobre esta tela",
    });
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  const navStarted = Date.now();
  const beforeNav = await page.evaluate(() => {
    const probe = (window as Window & { __IDBRF_PERF__?: { runtimeId?: string } }).__IDBRF_PERF__;
    return {
      runtimeId: probe?.runtimeId ?? null,
      navigations: performance.getEntriesByType("navigation").length,
    };
  });
  await page.getByRole("navigation", { name: "Módulos" }).getByRole("link", { name: "Secretaria" }).click();
  await page.waitForURL(/\/app\/secretaria\/?/);
  await page.getByRole("navigation", { name: "Módulos" }).getByRole("link", { name: "Membros e famílias" }).click();
  await page.waitForURL(/\/app\/membros\/?/);
  await page.getByLabel("Buscar membros").waitFor({ state: "visible" });
  const afterNav = await page.evaluate(() => {
    const probe = (window as Window & { __IDBRF_PERF__?: { runtimeId?: string } }).__IDBRF_PERF__;
    return {
      runtimeId: probe?.runtimeId ?? null,
      navigations: performance.getEntriesByType("navigation").length,
    };
  });
  const sameRuntime =
    Boolean(beforeNav.runtimeId) && beforeNav.runtimeId === afterNav.runtimeId && afterNav.navigations === beforeNav.navigations;
  keep({
    id: "navegacao-sem-reload",
    persona: "SECRETARIA",
    journey: "Membros → Secretaria → Membros sem recarga completa",
    status: sameRuntime ? "PASS" : "FAIL",
    ms: Date.now() - navStarted,
    detail: `runtime antes ${beforeNav.runtimeId ?? "ausente"} / depois ${afterNav.runtimeId ?? "ausente"}; navigation entries ${beforeNav.navigations} → ${afterNav.navigations}.`,
    owner: "PR #103",
  });
});

test("refresh com falha de lista apaga a sessão dentro da Secretaria", async ({ page, request }) => {
  const session = await loginApi(request, "ana.demo@example.test");
  if (!session.token) {
    keep({
      id: "sessao-refresh-falho",
      persona: "SECRETARIA",
      journey: "Falha de /memberships preserva o token",
      status: "BLOCKED",
      http: session.status,
      detail: "Login sintético indisponível.",
      owner: "PR #103 / PR #106",
    });
    return;
  }
  await openSession(page, session.token, "/app/membros/");
  await page.route("**/memberships**", (route) => route.abort("failed"));
  await page.route("**/admissions**", (route) => route.abort("failed"));
  await page.route("**/households**", (route) => route.abort("failed"));
  await page.reload({ waitUntil: "commit" }).catch((error: unknown) => {
    if (!String(error).includes("ERR_ABORTED")) throw error;
  });
  await Promise.race([
    page.getByLabel("Buscar membros").waitFor({ state: "visible", timeout: 15_000 }),
    page.getByRole("heading", { name: "Entre no ID Riacho 1" }).waitFor({ state: "visible", timeout: 15_000 }),
    page.getByRole("heading", { name: "Entre na sua conta." }).waitFor({ state: "visible", timeout: 15_000 }),
  ]).catch(() => undefined);
  const observed = await page.evaluate(() => ({
    token: window.sessionStorage.getItem("idbrf_demo_token"),
    innerLogin: document.body.innerText.includes("Entre no ID Riacho 1"),
  }));
  const evidence = await shot(page, "sessao-refresh-falho");
  const kept = Boolean(observed.token);
  keep({
    id: "sessao-refresh-falho",
    persona: "SECRETARIA",
    journey: "Falha de lista no refresh preserva o token",
    status: kept ? "PASS" : "FAIL",
    detail: kept
      ? "O token sintético permaneceu depois da falha de /memberships."
      : "HmlPhaseOne apagou o token em falha que não é 401. O catch de refresh chama clearToken para qualquer erro.",
    evidence,
    owner: "PR #106 (HmlPhaseOne) com o contrato de sessão do PR #103",
  });
});

test("401 e 403 das personas no código integrado", async ({ request }) => {
  const anonymous = await request.get(`${API}/persons/search?q=Bruno&limit=5`, { failOnStatusCode: false });
  keep({
    id: "api-401-sem-sessao",
    persona: "PUBLICACAO",
    journey: "Busca de pessoas sem sessão",
    status: anonymous.status() === 401 ? "PASS" : "FAIL",
    http: anonymous.status(),
    detail: `HTTP ${anonymous.status()}. Esperado 401.`,
    owner: "PR #101",
  });

  const cases: Array<{
    id: string;
    persona: string;
    email: string;
    method: "GET" | "PATCH";
    path: string;
    expect: number;
    journey: string;
    owner: string;
  }> = [
    { id: "api-403-admin-pastoral", persona: "ADMIN", email: "platform.demo@example.test", method: "GET", path: "/pastoral-cases", expect: 403, journey: "Admin técnico sem pastoral", owner: "PR #101" },
    { id: "api-403-admin-ledger", persona: "ADMIN", email: "platform.demo@example.test", method: "GET", path: "/ledger/accounts", expect: 403, journey: "Admin técnico sem ledger", owner: "PR #101" },
    { id: "api-403-tesouraria-pessoas", persona: "TESOURARIA", email: "tesouraria.demo@example.test", method: "GET", path: "/persons/search?q=Ana&limit=5", expect: 403, journey: "Tesouraria não busca pessoas", owner: "PR #101" },
    { id: "api-403-membro-ficha-alheia", persona: "MEMBRO", email: "bruno.demo@example.test", method: "GET", path: `/persons/${ANA}`, expect: 403, journey: "Membro não abre ficha alheia", owner: "PR #101" },
    { id: "api-200-secretaria-ficha", persona: "SECRETARIA", email: "ana.demo@example.test", method: "GET", path: `/persons/${BRUNO}`, expect: 200, journey: "Secretaria abre ficha sintética", owner: "API persons" },
    { id: "api-200-pastor-pastoral", persona: "PASTOR", email: "pastor.demo@example.test", method: "GET", path: "/pastoral-cases", expect: 200, journey: "Pastor lê casos pastorais", owner: "PR #101" },
    { id: "api-403-pastor-editar", persona: "PASTOR", email: "pastor.demo@example.test", method: "PATCH", path: `/persons/${BRUNO}`, expect: 403, journey: "Pastor não edita ficha", owner: "PR #101" },
    { id: "api-200-tesouraria-ledger", persona: "TESOURARIA", email: "tesouraria.demo@example.test", method: "GET", path: "/ledger/accounts", expect: 200, journey: "Tesouraria lê o ledger", owner: "PR #101" },
    { id: "api-403-lider-ficha", persona: "LIDER", email: "lider.jovens.demo@example.test", method: "GET", path: `/persons/${BRUNO}`, expect: 403, journey: "Líder não abre ficha geral", owner: "PR #101" },
  ];

  for (const item of cases) {
    const session = await loginApi(request, item.email);
    if (!session.token) {
      keep({
        id: item.id,
        persona: item.persona,
        journey: item.journey,
        status: "BLOCKED",
        http: session.status,
        detail: `Login HTTP ${session.status}.`,
        owner: item.owner,
      });
      continue;
    }
    const result = await api(
      request,
      session.token,
      item.method,
      item.path,
      item.method === "PATCH" ? { householdId: "demoHousehold01" } : undefined,
    );
    keep({
      id: item.id,
      persona: item.persona,
      journey: item.journey,
      status: result.status === item.expect ? "PASS" : "FAIL",
      http: result.status,
      detail: `HTTP ${result.status}. Esperado ${item.expect}.`,
      owner: item.owner,
    });
  }

  const editor = await loginApi(request, "editor.demo@example.test");
  keep({
    id: "editor-conta",
    persona: "EDITOR",
    journey: "Conta sintética EDITOR_SITE",
    status: "BLOCKED",
    http: editor.status,
    detail:
      editor.status === 401
        ? "O catálogo tem EDITOR_SITE e o seed não cria editor.demo@example.test (HTTP 401). Dependência de identidade, fora desta frente."
        : `Login do editor respondeu HTTP ${editor.status}. Continua fora do seed combinado.`,
    owner: "PR #101 / seed",
  });

  const admin = await loginApi(request, "platform.demo@example.test");
  if (!admin.token) {
    keep({
      id: "indicadores-pastoral-open",
      persona: "ADMIN",
      journey: "Resumo de indicadores sem pastoralOpen",
      status: "BLOCKED",
      detail: "Login de admin indisponível.",
      owner: "indicators",
    });
  } else {
    const summary = await api(request, admin.token, "GET", "/indicators/summary");
    const counts = (summary.body?.counts ?? summary.body) as Record<string, unknown> | null;
    const exposed = JSON.stringify(summary.body ?? {}).includes("pastoralOpen");
    keep({
      id: "indicadores-pastoral-open",
      persona: "ADMIN",
      journey: "Admin técnico não recebe contagem pastoralOpen",
      status: "BLOCKED",
      http: summary.status,
      detail: exposed
        ? `GET /indicators/summary HTTP ${summary.status} ainda inclui a chave pastoralOpen. Correção é de indicators, não desta frente.`
        : `HTTP ${summary.status}. A chave não apareceu neste corpo; conferir o service antes de promover a PASS.`,
      owner: "apps/api/src/indicators",
    });
    void counts;
  }

  const secretaria = await loginApi(request, "ana.demo@example.test");
  if (!secretaria.token) {
    keep({
      id: "auditoria-metadata",
      persona: "SECRETARIA",
      journey: "Metadata de auditoria",
      status: "BLOCKED",
      detail: "Login de secretaria indisponível.",
      owner: "apps/api/src/audit",
    });
  } else {
    const audit = await request.get(`${API}/audit-logs`, {
      headers: { Authorization: `Bearer ${secretaria.token}` },
      failOnStatusCode: false,
    });
    let raw = false;
    if (audit.ok()) {
      const body = (await audit.json()) as { entries?: Array<{ metadata?: unknown }>; items?: Array<{ metadata?: unknown }> };
      const entries = body.entries ?? body.items ?? [];
      raw = entries.some((entry) => entry.metadata != null);
    }
    keep({
      id: "auditoria-metadata",
      persona: "SECRETARIA",
      journey: "Trilha de auditoria sem metadata cru",
      status: "BLOCKED",
      http: audit.status(),
      detail: raw
        ? `GET /audit-logs HTTP ${audit.status()} devolve metadata sem redação. Conteúdo não foi copiado para este relatório.`
        : `HTTP ${audit.status()}. Não houve metadata não nulo nesta página; o service da main ainda serializa metadata cru quando existe.`,
      owner: "apps/api/src/audit",
    });
  }

  keep({
    id: "ci-pipeline",
    persona: "PLATAFORMA",
    journey: "Suíte ligada ao workflow compartilhado",
    status: "BLOCKED",
    detail: ".github/workflows não entra neste PR. O agente integrador segue dono do CI.",
    owner: "integrador",
  });
  keep({
    id: "hml-remota",
    persona: "PLATAFORMA",
    journey: "Homologação remota",
    status: "BLOCKED",
    detail: "Não há HML de teste alcançável. A execução usou Postgres local e contas *.demo@example.test.",
    owner: "ambiente",
  });
});

test("vitrine do design system nas três larguras", async ({ page }) => {
  const widths = [1440, 768, 360] as const;
  let failed = false;
  const notes: string[] = [];
  for (const width of widths) {
    await page.setViewportSize({ width, height: width === 360 ? 780 : 900 });
    const response = await page.goto("/design-system/");
    const status = response?.status() ?? 0;
    const overflow = await horizontalOverflow(page);
    const evidence = await shot(page, `design-system-${width}`);
    notes.push(`${width} HTTP ${status} overflow ${overflow}px`);
    if (status >= 400 || overflow > 1) failed = true;
    void evidence;
  }
  keep({
    id: "design-system-vitrine",
    persona: "PUBLICACAO",
    journey: "Vitrine /design-system nas larguras 360, 768 e 1440",
    status: failed ? "FAIL" : "PASS",
    detail: `${notes.join("; ")}. A vitrine não substitui o painel logado.`,
    evidence: "reports/evidence/design-system-1440.png",
    owner: "PR #102",
  });
});
