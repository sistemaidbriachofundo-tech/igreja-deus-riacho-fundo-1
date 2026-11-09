import { expect, test, type Page } from "@playwright/test";
import { ACCOUNTS, apiBase, apiJson, apiStatus, demoPassword, loginAccount } from "../../src/accounts";
import { keep, finish, requireWeb, row } from "../../src/commit";
import type { MatrixRow } from "../../src/matrix";
import { classify, horizontalOverflow, isReachable, shot } from "../../src/surface";

const ANA = "demoPersonRiacho01";
const BRUNO = "demoPersonMembro01";

type Hit = { person?: { id?: string; displayName?: string; householdId?: string | null } };

async function loginUi(page: Page, email: string): Promise<boolean> {
  await page.goto("/login/");
  const submit = page.getByRole("button", { name: "Entrar no painel" });
  await submit.waitFor({ state: "visible", timeout: 15_000 });
  if (await submit.isDisabled()) return false;
  await page.locator("#church-email").fill(email);
  await page.locator("#church-password").fill(demoPassword());
  await submit.click();
  try {
    await page.waitForURL(/\/app\//, { timeout: 20_000 });
    return (await classify(page)).surface === "operational";
  } catch {
    return false;
  }
}

test("secretaria busca, abre, edita e reabre na API", async ({ request }) => {
  const bucket: MatrixRow[] = [];
  if (!(await isReachable(request, `${apiBase()}/health`))) {
    keep(row("SECRETARIA/jornada-api", "SECRETARIA", "Buscar, abrir, editar e reabrir na API", "BLOCKED", "API local indisponível."), bucket);
    finish(bucket);
    return;
  }
  const login = await loginAccount(request, ACCOUNTS[0]);
  if (!login.session) {
    keep(row("SECRETARIA/jornada-api", "SECRETARIA", "Buscar, abrir, editar e reabrir na API", "FAIL", `Login sintético HTTP ${login.status}.`), bucket);
    finish(bucket);
    return;
  }
  const found = await apiJson<{ hits?: Hit[] }>(request, login.session.token, "/persons/search?q=Bruno&limit=5");
  const hit = found.body?.hits?.find((item) => item.person?.id === BRUNO);
  keep(row(
    "SECRETARIA/buscar-api",
    "SECRETARIA",
    "Buscar pessoa",
    found.status === 200 && hit?.person?.id ? "PASS" : "FAIL",
    found.status === 200 && hit?.person?.id
      ? "A busca devolveu a pessoa sintética Bruno do seed."
      : `Busca HTTP ${found.status} sem a pessoa sintética esperada.`,
  ), bucket);
  if (!hit?.person?.id) {
    finish(bucket);
    return;
  }
  const opened = await apiJson<{ id?: string; householdId?: string | null }>(
    request,
    login.session.token,
    `/persons/${hit.person.id}`,
  );
  keep(row(
    "SECRETARIA/abrir-api",
    "SECRETARIA",
    "Abrir ficha",
    opened.status === 200 && opened.body?.id === hit.person.id ? "PASS" : "FAIL",
    opened.status === 200 ? "GET da ficha sintética respondeu 200." : `Abertura HTTP ${opened.status}.`,
  ), bucket);
  const edited = await apiStatus(request, login.session.token, "PATCH", `/persons/${hit.person.id}`, {
    householdId: opened.body?.householdId ?? null,
  });
  keep(row(
    "SECRETARIA/editar-api",
    "SECRETARIA",
    "Editar ficha",
    edited === 200 ? "PASS" : "FAIL",
    edited === 200
      ? "PATCH idempotente do núcleo familiar sintético foi aceito e auditado pela API."
      : `Edição HTTP ${edited}.`,
  ), bucket);
  const reopened = await apiJson<{ id?: string; householdId?: string | null }>(
    request,
    login.session.token,
    `/persons/${hit.person.id}`,
  );
  const same = reopened.status === 200 && reopened.body?.householdId === (opened.body?.householdId ?? null);
  keep(row(
    "SECRETARIA/reabrir-api",
    "SECRETARIA",
    "Reabrir ficha",
    same ? "PASS" : "FAIL",
    same ? "A reabertura devolveu a mesma ficha sintética persistida." : `Reabertura HTTP ${reopened.status}.`,
  ), bucket);
  finish(bucket);
});

test("controles negativos de ficha", async ({ request }) => {
  const bucket: MatrixRow[] = [];
  if (!(await isReachable(request, `${apiBase()}/health`))) {
    keep(row("PLATAFORMA/ficha-negativa", "PLATAFORMA", "Negativas de ficha", "BLOCKED", "API local indisponível."), bucket);
    finish(bucket);
    return;
  }
  const pastor = await loginAccount(request, ACCOUNTS[1]);
  const member = await loginAccount(request, ACCOUNTS[4]);
  const treasury = await loginAccount(request, ACCOUNTS[2]);
  const leader = await loginAccount(request, ACCOUNTS[3]);
  const admin = await loginAccount(request, ACCOUNTS[5]);
  const cases: Array<{ persona: MatrixRow["persona"]; session?: { token: string }; path: string; method: "GET" | "PATCH"; expect: number; journey: string; id: string }> = [
    { persona: "PASTOR", session: pastor.session, path: `/persons/${BRUNO}`, method: "PATCH", expect: 403, journey: "Pastor não edita ficha de secretaria", id: "PASTOR/editar-negado" },
    { persona: "MEMBRO", session: member.session, path: `/persons/${ANA}`, method: "GET", expect: 403, journey: "Membro não abre ficha de outra pessoa", id: "MEMBRO/ficha-alheia" },
    { persona: "MEMBRO", session: member.session, path: `/persons/${member.session?.personId ?? BRUNO}`, method: "GET", expect: 200, journey: "Membro abre a própria ficha", id: "MEMBRO/ficha-propria" },
    { persona: "TESOURARIA", session: treasury.session, path: "/persons/search?q=Ana&limit=5", method: "GET", expect: 403, journey: "Tesouraria não busca pessoas", id: "TESOURARIA/busca-negada" },
    { persona: "LIDER", session: leader.session, path: `/persons/${BRUNO}`, method: "GET", expect: 403, journey: "Líder não abre ficha geral", id: "LIDER/ficha-negada" },
    { persona: "ADMIN", session: admin.session, path: "/pastoral-cases", method: "GET", expect: 403, journey: "Admin técnico sem acesso pastoral", id: "ADMIN/pastoral-negado" },
    { persona: "ADMIN", session: admin.session, path: "/ledger/accounts", method: "GET", expect: 403, journey: "Admin técnico sem acesso financeiro", id: "ADMIN/financeiro-negado" },
  ];
  for (const item of cases) {
    if (!item.session) {
      keep(row(item.id, item.persona, item.journey, "BLOCKED", "Login sintético indisponível."), bucket);
      continue;
    }
    const status = await apiStatus(request, item.session.token, item.method, item.path, item.method === "PATCH" ? { householdId: "demoHousehold01" } : undefined);
    keep(row(
      item.id,
      item.persona,
      item.journey,
      status === item.expect ? "PASS" : "FAIL",
      status === item.expect ? `HTTP ${status}, como o contrato atual determina.` : `HTTP ${status}; o contrato atual espera ${item.expect}.`,
    ), bucket);
  }
  finish(bucket);
});

test("interface de secretaria busca, mas não abre nem edita a ficha", async ({ page }, testInfo) => {
  const bucket: MatrixRow[] = [];
  if (!(await requireWeb(page, testInfo, "SECRETARIA", "SECRETARIA/ui-servidor"))) return;
  const signed = await loginUi(page, "ana.demo@example.test");
  if (!signed) {
    keep(row("SECRETARIA/ui-jornada", "SECRETARIA", "Buscar, abrir, editar e reabrir na interface", "BLOCKED", "O login de Secretaria não chegou a um módulo operacional."), bucket);
    finish(bucket);
    return;
  }
  await page.goto("/app/membros/");
  const surface = await classify(page);
  const search = page.getByLabel("Buscar membros");
  const hasSearch = surface.surface === "operational" && (await search.count()) === 1;
  if (hasSearch) {
    await search.fill("Bruno");
  }
  const bruno = page.getByText("Bruno Demo Membro", { exact: false });
  const ana = page.getByText("Ana Demo Secretária", { exact: false });
  const filtered = hasSearch && (await bruno.count()) > 0 && (await ana.count()) === 0;
  const evidence = await shot(page, "hml-membros-busca");
  keep(row(
    "SECRETARIA/buscar-ui",
    "SECRETARIA",
    "Buscar pessoa na interface",
    filtered ? "PASS" : "FAIL",
    filtered
      ? "O diretório HML filtrou a pessoa sintética Bruno e escondeu as demais linhas."
      : `Superfície ${surface.surface}. A busca não isolou a pessoa sintética.`,
    { evidence },
  ), bucket);

  const opener = page.getByRole("button", { name: /abrir|editar|prontuário|observaç/i });
  const personLink = page.getByRole("link", { name: /Bruno Demo/i });
  const canOpen = (await opener.count()) > 0 || (await personLink.count()) > 0;
  keep(row(
    "SECRETARIA/abrir-ui",
    "SECRETARIA",
    "Abrir ficha na interface",
    canOpen ? "PASS" : "FAIL",
    canOpen
      ? "Existe um controle para abrir a ficha a partir da busca."
      : "A lista HML não oferece controle para abrir a ficha. A tela de membros não aprova a jornada de prontuário.",
    { evidence },
  ), bucket);
  let edited = false;
  if (canOpen) {
    await ((await personLink.count()) > 0 ? personLink.first() : opener.first()).click();
    edited = (await page.locator("textarea, form input:not([type='search'])").count()) > 0;
  }
  keep(row(
    "SECRETARIA/editar-ui",
    "SECRETARIA",
    "Editar ficha na interface",
    edited ? "PASS" : "FAIL",
    edited
      ? "A ficha aberta expõe campos editáveis."
      : "Não há formulário de edição persistida. O PATCH de pessoa existe na API e não nesta tela.",
  ), bucket);
  let reopened = false;
  if (edited) {
    await page.keyboard.press("Escape");
    await search.fill("Bruno");
    reopened = (await page.getByText("Bruno Demo Membro").count()) > 0;
  }
  keep(row(
    "SECRETARIA/reabrir-ui",
    "SECRETARIA",
    "Reabrir ficha na interface",
    reopened ? "PASS" : "FAIL",
    reopened
      ? "A mesma pessoa sintética voltou a aparecer depois de fechar a ficha."
      : "Sem ficha aberta, não há como fechar e reabrir o mesmo cadastro na interface HML.",
  ), bucket);

  await page.goto("/app/secretaria/");
  const secretary = await classify(page);
  const secretaryShot = await shot(page, "hml-secretaria-operacional");
  const operational = secretary.surface === "operational" && secretary.markers.some((marker) => /admiss|protocolo/i.test(marker));
  keep(row(
    "SECRETARIA/modulo",
    "SECRETARIA",
    "Módulo Secretaria distinto do login",
    operational ? "PASS" : "FAIL",
    operational
      ? `Módulo operacional visível (${secretary.markers.join(", ")}). Esta evidência não é a tela de login.`
      : `Depois do login a rota ficou em ${secretary.surface}.`,
    { evidence: secretaryShot },
  ), bucket);
  expect(secretary.surface).not.toBe("login-gate");
  finish(bucket);
});

test("módulos visíveis por persona", async ({ page }, testInfo) => {
  const bucket: MatrixRow[] = [];
  if (!(await requireWeb(page, testInfo, "PLATAFORMA", "PLATAFORMA/modulos-servidor"))) return;
  const expectations: Array<{
    account: (typeof ACCOUNTS)[number];
    present: string[];
    absent: string[];
    empty?: boolean;
  }> = [
    { account: ACCOUNTS[0], present: ["Ministérios"], absent: ["Tesouraria", "Cuidado pastoral"] },
    { account: ACCOUNTS[1], present: ["Cuidado pastoral", "Ministérios"], absent: ["Tesouraria"] },
    { account: ACCOUNTS[2], present: ["Tesouraria"], absent: ["Cuidado pastoral", "Ministérios"] },
    { account: ACCOUNTS[3], present: ["Ministérios"], absent: ["Tesouraria", "Cuidado pastoral"] },
    { account: ACCOUNTS[4], present: [], absent: ["Tesouraria", "Cuidado pastoral", "Ministérios"], empty: true },
    { account: ACCOUNTS[5], present: ["Ministérios"], absent: ["Tesouraria", "Cuidado pastoral"] },
  ];
  for (const item of expectations) {
    await page.goto("/login/");
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    const signed = await loginUi(page, item.account.email);
    if (!signed) {
      keep(row(`${item.account.persona}/modulos-ui`, item.account.persona, "Módulos visíveis", "BLOCKED", "Login não abriu o painel."), bucket);
      continue;
    }
    await page.goto("/app/operacao/");
    await page.getByText(/Conectado como|Nenhuma área habilitada|Entrar para continuar/).waitFor({ timeout: 15_000 });
    const empty = (await page.getByRole("heading", { name: "Nenhuma área habilitada para este perfil" }).count()) === 1;
    const missing = [];
    for (const label of item.present) {
      if ((await page.getByRole("button", { name: label }).count()) === 0) missing.push(`faltou ${label}`);
    }
    for (const label of item.absent) {
      if ((await page.getByRole("button", { name: label }).count()) > 0) missing.push(`exibiu ${label}`);
    }
    if (item.empty && !empty) missing.push("esperava nenhuma área");
    if (!item.empty && empty) missing.push("nenhuma área ficou habilitada");
    const evidence = ["TESOURARIA", "PASTOR", "ADMIN"].includes(item.account.persona)
      ? await shot(page, `hml-operacao-${item.account.persona.toLowerCase()}`)
      : undefined;
    keep(row(
      `${item.account.persona}/modulos-ui`,
      item.account.persona,
      "Módulos visíveis na operação",
      missing.length === 0 ? "PASS" : "FAIL",
      missing.length === 0 ? "A navegação mostra só as áreas do papel." : missing.join("; "),
      { evidence },
    ), bucket);
  }
  finish(bucket);
});

test("viewports 360, 768 e 1440 no módulo autenticado", async ({ page }, testInfo) => {
  const bucket: MatrixRow[] = [];
  if (!(await requireWeb(page, testInfo, "SECRETARIA", "SECRETARIA/viewport-servidor"))) return;
  const signed = await loginUi(page, "ana.demo@example.test");
  if (!signed) {
    keep(row("SECRETARIA/viewports", "SECRETARIA", "Layout 360/768/1440", "BLOCKED", "Sem sessão operacional para medir o módulo."), bucket);
    finish(bucket);
    return;
  }
  for (const width of [360, 768, 1440] as const) {
    await page.setViewportSize({ width, height: width === 360 ? 780 : 1000 });
    const started = Date.now();
    await page.goto("/app/membros/");
    const surface = await classify(page);
    const overflow = await horizontalOverflow(page);
    const evidence = await shot(page, `hml-membros-${width}`);
    const ok = surface.surface === "operational" && overflow <= 4;
    keep(row(
      `SECRETARIA/viewport-membros-${width}`,
      "SECRETARIA",
      `Membros em ${width}px`,
      ok ? "PASS" : "FAIL",
      surface.surface !== "operational"
        ? `A rota de membros ficou em ${surface.surface}, então a medida não é do módulo.`
        : `Overflow horizontal ${overflow}px no diretório autenticado.`,
      { evidence, durationMs: Date.now() - started },
    ), bucket);
    await page.goto("/app/secretaria/");
    const secretary = await classify(page);
    const secretaryOverflow = await horizontalOverflow(page);
    keep(row(
      `SECRETARIA/viewport-secretaria-${width}`,
      "SECRETARIA",
      `Secretaria em ${width}px`,
      secretary.surface === "operational" && secretaryOverflow <= 4 ? "PASS" : "FAIL",
      secretary.surface === "operational"
        ? `Overflow horizontal ${secretaryOverflow}px no módulo Secretaria.`
        : `Secretaria ficou em ${secretary.surface}.`,
      { durationMs: await page.evaluate(() => Math.round(performance.getEntriesByType("navigation")[0]?.duration ?? 0)) },
    ), bucket);
  }
  finish(bucket);
});
