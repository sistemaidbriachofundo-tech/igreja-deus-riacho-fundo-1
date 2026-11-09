import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { test, type APIRequestContext, type Page, type TestInfo } from "@playwright/test";
import { apiBase, apiCall, demoPassword, loginAccount } from "../../src/accounts";
import { finish, keep, requireWeb, row } from "../../src/commit";
import { readJournal } from "../../src/journal";
import type { MatrixRow, Persona } from "../../src/matrix";
import {
  PHASE_G_PERSONAS,
  classifyContrast,
  classifyDraftRoundtrip,
  classifyExpectedStatus,
  classifyFinanceHonesty,
  classifyFocusVisible,
  classifyFormalMembership,
  classifyLoginMe,
  classifyMenu,
  classifyOverflow,
  classifyOwnAgenda,
  classifyPublicationGate,
  contrastRatio,
  recordOf,
  renderBugs,
  type GPersona,
  type GPersonaId,
} from "../../src/phase-g";
import { classify, horizontalOverflow, isReachable, shot } from "../../src/surface";

const PAGES = process.env.QA_PAGES_URL ?? "https://sistemaidbriachofundo-tech.github.io/igreja-deus-riacho-fundo-1/";
const JOVENS = "demoMinistryJovens";
const HOMENS = "demoMinistryHomens";
const DEST_CHURCH = "demoChurchDest02";
const BRUNO = "demoPersonMembro01";

const personaMatrix: Record<GPersonaId, Persona> = {
  ADMIN: "ADMIN",
  PASTOR: "PASTOR",
  SECRETARIA: "SECRETARIA",
  TESOURARIA: "TESOURARIA",
  LIDER: "LIDER",
  MEMBRO: "MEMBRO",
  EDITOR: "EDITOR",
  PUBLICADOR: "EDITOR",
};

function personaOf(id: GPersonaId): Persona {
  return personaMatrix[id];
}

test.afterAll(() => {
  const target = fileURLToPath(new URL("../../reports/bugs.md", import.meta.url));
  fs.mkdirSync(fileURLToPath(new URL("../../reports/", import.meta.url)), { recursive: true });
  fs.writeFileSync(target, renderBugs(readJournal()));
});

async function loginUi(page: Page, email: string): Promise<boolean> {
  await page.goto("/login/");
  const submit = page.getByRole("button", { name: "Entrar no painel" });
  await submit.waitFor({ state: "visible", timeout: 20_000 });
  if (await submit.isDisabled()) return false;
  await page.locator("#church-email").fill(email);
  await page.locator("#church-password").fill(demoPassword());
  await submit.click();
  try {
    await page.waitForURL(/\/app\//, { timeout: 25_000 });
    return (await classify(page)).surface === "operational";
  } catch {
    return false;
  }
}

async function openSession(request: APIRequestContext, persona: GPersona) {
  const account = {
    persona: personaOf(persona.id),
    email: persona.email,
    seeded: persona.seeded,
  };
  return loginAccount(request, account);
}

test("G autentica as oito personas em /auth/login e /auth/me", async ({ request }) => {
  const bucket: MatrixRow[] = [];
  const up = await isReachable(request, `${apiBase()}/health`);
  if (!up) {
    keep(row("G/auth-api", "PLATAFORMA", "API sintética", "BLOCKED", "API local indisponível. A HML remota não foi chamada: não há URL nem segredo neste agente."), bucket);
    finish(bucket);
    return;
  }
  const anon = await apiCall(request, null, "GET", "/auth/me");
  const anonRow = classifyExpectedStatus(anon.status, 401, "GET /auth/me sem sessão respondeu 401.");
  keep(row("G/auth-anon", "PUBLICACAO", "Sessão ausente", anonRow.status, anonRow.detail), bucket);

  for (const persona of PHASE_G_PERSONAS) {
    const started = Date.now();
    const login = await apiCall(request, null, "POST", "/auth/login", {
      email: persona.email,
      password: demoPassword(),
    });
    const token = recordOf(login.body)?.accessToken;
    const me = typeof token === "string" ? await apiCall(request, token, "GET", "/auth/me") : { status: null, body: null };
    const meBody = recordOf(me.body);
    const grants = Array.isArray(meBody?.grants) ? meBody.grants : [];
    const roles = grants
      .map((grant) => recordOf(grant)?.roleCode)
      .filter((role): role is string => typeof role === "string");
    const verdict = classifyLoginMe({
      seeded: persona.seeded,
      expectedEmail: persona.email,
      expectedRole: persona.role,
      loginStatus: login.status,
      meStatus: me.status,
      email: typeof meBody?.email === "string" ? meBody.email : null,
      roles,
      organizationId: typeof meBody?.organizationId === "string" ? meBody.organizationId : null,
      churchId: typeof meBody?.churchId === "string" ? meBody.churchId : null,
      personId: typeof meBody?.personId === "string" ? meBody.personId : null,
    });
    keep(row(`G/auth-${persona.id.toLowerCase()}`, personaOf(persona.id), `Login e /auth/me de ${persona.id}`, verdict.status, verdict.detail, { durationMs: Date.now() - started }), bucket);
  }
  keep(row(
    "G/auth-hml-remota",
    "PLATAFORMA",
    "API HML remota",
    "BLOCKED",
    "Não há HML_PUBLIC_API_URL nem segredo de homologação neste agente. A matriz acima é da API sintética local. O link oficial não recebe esta suíte autenticada.",
  ), bucket);
  finish(bucket);
});

test("G aplica 401, 403 e isolamento de igreja e ministério", async ({ request }) => {
  const bucket: MatrixRow[] = [];
  if (!(await isReachable(request, `${apiBase()}/health`))) {
    keep(row("G/rbac-api", "PLATAFORMA", "RBAC", "BLOCKED", "API local indisponível."), bucket);
    finish(bucket);
    return;
  }
  const sessions = new Map<GPersonaId, string>();
  for (const persona of PHASE_G_PERSONAS) {
    if (!persona.seeded) continue;
    const login = await openSession(request, persona);
    if (login.session) sessions.set(persona.id, login.session.token);
  }
  const secretaria = sessions.get("SECRETARIA");
  const leader = sessions.get("LIDER");
  const member = sessions.get("MEMBRO");
  const treasury = sessions.get("TESOURARIA");
  const admin = sessions.get("ADMIN");
  const editor = sessions.get("EDITOR");
  const pastor = sessions.get("PASTOR");

  const checks: Array<{ id: string; persona: GPersonaId; token?: string; method: "GET" | "POST" | "PATCH"; path: string; data?: unknown; expect: number; journey: string }> = [
    { id: "G/rbac-anon-pessoas", persona: "MEMBRO", method: "GET", path: "/persons/search?q=Bruno&limit=5", expect: 401, journey: "Busca de pessoas sem sessão" },
    { id: "G/rbac-tesouraria-pessoas", persona: "TESOURARIA", token: treasury, method: "GET", path: "/persons/search?q=Ana&limit=5", expect: 403, journey: "Tesouraria não busca pessoas" },
    { id: "G/rbac-membro-alheia", persona: "MEMBRO", token: member, method: "GET", path: "/persons/demoPersonRiacho01", expect: 403, journey: "Membro não abre ficha alheia" },
    { id: "G/rbac-membro-propria", persona: "MEMBRO", token: member, method: "GET", path: `/persons/${BRUNO}`, expect: 200, journey: "Membro abre a própria ficha" },
    { id: "G/rbac-admin-pastoral", persona: "ADMIN", token: admin, method: "GET", path: "/pastoral-cases", expect: 403, journey: "Admin técnico sem pastoral" },
    { id: "G/rbac-admin-ledger", persona: "ADMIN", token: admin, method: "GET", path: "/ledger/accounts", expect: 403, journey: "Admin técnico sem ledger" },
    { id: "G/rbac-secretaria-ledger", persona: "SECRETARIA", token: secretaria, method: "GET", path: "/ledger/accounts", expect: 403, journey: "Secretaria sem ledger" },
    { id: "G/rbac-editor-pessoas", persona: "EDITOR", token: editor, method: "GET", path: "/persons/search?q=Ana&limit=5", expect: 403, journey: "Editor não busca pessoas" },
    { id: "G/rbac-pastor-patch", persona: "PASTOR", token: pastor, method: "PATCH", path: `/persons/${BRUNO}`, data: { householdId: "demoHousehold01" }, expect: 403, journey: "Pastor não edita ficha" },
    { id: "G/rbac-lider-homens", persona: "LIDER", token: leader, method: "GET", path: `/ministry-scope/${HOMENS}/formal-memberships`, expect: 403, journey: "Líder não lê outro ministério" },
    { id: "G/rbac-membro-vinculo", persona: "MEMBRO", token: member, method: "GET", path: `/ministry-scope/${JOVENS}/formal-memberships`, expect: 403, journey: "Membro não lê vínculo formal" },
    { id: "G/rbac-tesouraria-eventos", persona: "TESOURARIA", token: treasury, method: "GET", path: "/events", expect: 403, journey: "Tesouraria não lista eventos internos" },
    { id: "G/rbac-membro-eventos", persona: "MEMBRO", token: member, method: "GET", path: "/events", expect: 403, journey: "Membro não lista eventos internos" },
  ];
  for (const item of checks) {
    if (!item.token && item.expect !== 401) {
      keep(row(item.id, personaOf(item.persona), item.journey, "BLOCKED", "Login sintético indisponível."), bucket);
      continue;
    }
    const result = await apiCall(request, item.token ?? null, item.method, item.path, item.data);
    const verdict = classifyExpectedStatus(result.status, item.expect, `HTTP ${item.expect}, como o contrato atual determina.`);
    keep(row(item.id, personaOf(item.persona), item.journey, verdict.status, verdict.detail), bucket);
  }

  if (member) {
    const denied = await apiCall(request, member, "POST", "/auth/switch-church", { churchId: DEST_CHURCH });
    const missing = await apiCall(request, member, "POST", "/auth/switch-church", { churchId: "igreja-inexistente" });
    const still = await apiCall(request, member, "GET", "/auth/me");
    const churchId = recordOf(still.body)?.churchId;
    const switchRow = classifyExpectedStatus(denied.status, 403, "POST /auth/switch-church para a congregação destino sem grant respondeu 403.");
    keep(row("G/isolamento-igreja", "MEMBRO", "Troca para congregação sem grant", switchRow.status, switchRow.detail), bucket);
    const missingRow = classifyExpectedStatus(missing.status, 403, "Congregação inexistente também foi recusada.");
    keep(row("G/isolamento-igreja-ausente", "MEMBRO", "Congregação inexistente", missingRow.status, missingRow.detail), bucket);
    keep(row(
      "G/isolamento-sessao",
      "MEMBRO",
      "Sessão permanece na congregação original",
      still.status === 200 && churchId && churchId !== DEST_CHURCH ? "PASS" : "FAIL",
      still.status === 200 && churchId && churchId !== DEST_CHURCH
        ? "Depois da troca recusada, /auth/me continua fora da congregação destino."
        : `HTTP ${still.status}. A sessão não comprovou permanência na congregação original.`,
    ), bucket);
  }

  if (leader && secretaria) {
    const own = await apiCall(request, leader, "GET", `/ministry-scope/${JOVENS}/formal-memberships`);
    const formal = classifyFormalMembership(own.status, own.body);
    keep(row("G/ministerios-persistencia", "LIDER", "Vínculo formal do ministério autorizado", formal.persistence, formal.detail), bucket);
    keep(row("G/ministerios-honestidade-api", "LIDER", "API não inventa integrantes", formal.honesty, formal.detail), bucket);
    const balance = await apiCall(request, secretaria, "GET", `/ministry-scope/${JOVENS}/cost-center-balance`);
    const balanceBody = recordOf(balance.body);
    const balanceHonest = balance.status === 501 && balanceBody?.balance == null;
    keep(row(
      "G/ministerios-saldo",
      "SECRETARIA",
      "Saldo ministerial sem contrato financeiro",
      balanceHonest ? "PASS" : "FAIL",
      balanceHonest
        ? "HTTP 501 e balance nulo. Nenhum valor de centro de custo foi calculado."
        : `HTTP ${balance.status}. O saldo não ficou explicitamente ausente.`,
    ), bucket);
    const listed = await apiCall(request, secretaria, "GET", "/events");
    const events = Array.isArray(recordOf(listed.body)?.events) ? (recordOf(listed.body)?.events as unknown[]) : [];
    const slugs = events.map((item) => recordOf(item)?.slug).filter((slug): slug is string => typeof slug === "string");
    const leaderEvents = await apiCall(request, leader, "GET", "/events");
    const leaderRows = Array.isArray(recordOf(leaderEvents.body)?.events) ? (recordOf(leaderEvents.body)?.events as unknown[]) : [];
    const foreign = leaderRows.filter((item) => {
      const row = recordOf(item);
      return row?.ministryId !== JOVENS;
    });
    keep(row(
      "G/eventos-secretaria",
      "SECRETARIA",
      "Eventos sintéticos persistidos",
      listed.status === 200 && slugs.includes("encontro-jovens-demo") ? "PASS" : "FAIL",
      listed.status === 200 && slugs.includes("encontro-jovens-demo")
        ? "GET /events devolveu o encontro sintético de jovens já gravado no seed."
        : `HTTP ${listed.status}. Slugs visíveis: ${slugs.join(", ") || "nenhum"}.`,
    ), bucket);
    keep(row(
      "G/eventos-lider",
      "LIDER",
      "Líder só vê evento do ministério autorizado",
      leaderEvents.status === 200 && foreign.length === 0 && leaderRows.length > 0 ? "PASS" : "FAIL",
      leaderEvents.status === 200 && foreign.length === 0 && leaderRows.length > 0
        ? "A lista do líder contém só o ministério de jovens."
        : `HTTP ${leaderEvents.status}. Itens fora do ministério: ${foreign.length}. Itens no total: ${leaderRows.length}.`,
    ), bucket);
  }
  finish(bucket);
});

test("G cria evento sintético e não cobra", async ({ request }) => {
  const bucket: MatrixRow[] = [];
  if (!(await isReachable(request, `${apiBase()}/health`))) {
    keep(row("G/evento-criar", "SECRETARIA", "Persistência de evento", "BLOCKED", "API local indisponível."), bucket);
    finish(bucket);
    return;
  }
  const secretaria = await openSession(request, PHASE_G_PERSONAS[2]);
  const leader = await openSession(request, PHASE_G_PERSONAS[4]);
  const member = await openSession(request, PHASE_G_PERSONAS[5]);
  if (!secretaria.session || !leader.session || !member.session) {
    keep(row("G/evento-criar", "SECRETARIA", "Persistência de evento", "BLOCKED", "Login sintético indisponível."), bucket);
    finish(bucket);
    return;
  }
  const slug = `qa-g-sintetico-${Date.now()}`;
  const created = await apiCall(request, secretaria.session.token, "POST", "/events", {
    name: "QA G evento sintético",
    slug,
    startsAt: "2026-12-01T19:00:00.000Z",
    ministryId: JOVENS,
    description: "Registro fictício da suíte G. Sem pagamento.",
    featuredOnHome: false,
  });
  const eventId = recordOf(created.body)?.id;
  const createdOk = (created.status === 200 || created.status === 201) && typeof eventId === "string";
  let rereadOk = false;
  let archived = false;
  if (createdOk && typeof eventId === "string") {
    const again = await apiCall(request, secretaria.session.token, "GET", `/events/${eventId}`);
    rereadOk = again.status === 200 && recordOf(again.body)?.slug === slug;
    const archive = await apiCall(request, secretaria.session.token, "POST", `/events/${eventId}/archive`);
    archived = archive.status === 200 || archive.status === 201;
    const after = await apiCall(request, secretaria.session.token, "GET", `/events/${eventId}`);
    archived = archived && recordOf(after.body)?.status === "ARCHIVED";
  }
  keep(row(
    "G/evento-persistencia",
    "SECRETARIA",
    "Criar, reler e arquivar evento sintético",
    createdOk && rereadOk && archived ? "PASS" : "FAIL",
    createdOk && rereadOk && archived
      ? "O evento fictício foi gravado, relido e arquivado. Não houve publicação nem cobrança."
      : `Criação HTTP ${created.status}. Releitura ${rereadOk ? "ok" : "falhou"}. Arquivamento ${archived ? "ok" : "falhou"}.`,
  ), bucket);
  const leaderForeign = await apiCall(request, leader.session.token, "POST", "/events", {
    name: "QA G fora do escopo",
    slug: `${slug}-fora`,
    startsAt: "2026-12-02T19:00:00.000Z",
    ministryId: HOMENS,
  });
  const memberCreate = await apiCall(request, member.session.token, "POST", "/events", {
    name: "QA G membro",
    slug: `${slug}-membro`,
    startsAt: "2026-12-03T19:00:00.000Z",
    ministryId: JOVENS,
  });
  const leaderRow = classifyExpectedStatus(leaderForeign.status, 403, "O líder não criou evento no ministério de homens.");
  const memberRow = classifyExpectedStatus(memberCreate.status, 403, "O membro não criou evento.");
  keep(row("G/evento-lider-negado", "LIDER", "Líder não cria evento em outro ministério", leaderRow.status, leaderRow.detail), bucket);
  keep(row("G/evento-membro-negado", "MEMBRO", "Membro não cria evento", memberRow.status, memberRow.detail), bucket);
  const payment = JSON.stringify(created.body ?? {});
  keep(row(
    "G/evento-sem-pix",
    "SECRETARIA",
    "Evento sem cobrança",
    /pix|checkout|paymentUrl/i.test(payment) ? "FAIL" : "PASS",
    /pix|checkout|paymentUrl/i.test(payment)
      ? "A resposta do evento trouxe indício de cobrança."
      : "A criação do evento sintético não devolveu Pix, checkout nem URL de pagamento.",
  ), bucket);
  finish(bucket);
});

test("G grava rascunho do editor e restaura sem publicar", async ({ request }) => {
  const bucket: MatrixRow[] = [];
  if (!(await isReachable(request, `${apiBase()}/health`))) {
    keep(row("G/cms-rascunho", "EDITOR", "Rascunho do editor", "BLOCKED", "API local indisponível."), bucket);
    finish(bucket);
    return;
  }
  const editor = await openSession(request, PHASE_G_PERSONAS[6]);
  const member = await openSession(request, PHASE_G_PERSONAS[5]);
  const publisher = await apiCall(request, null, "POST", "/auth/login", {
    email: "publicador.demo@example.test",
    password: demoPassword(),
  });
  const publisherRow = classifyLoginMe({
    seeded: false,
    expectedEmail: "publicador.demo@example.test",
    expectedRole: "PUBLICADOR_SITE",
    loginStatus: publisher.status,
    meStatus: null,
  });
  keep(row("G/cms-publicador", "EDITOR", "Conta sintética de publicador", publisherRow.status, publisherRow.detail), bucket);
  if (!editor.session || !member.session) {
    keep(row("G/cms-rascunho", "EDITOR", "Rascunho do editor", "BLOCKED", "Login do editor ou do membro indisponível."), bucket);
    finish(bucket);
    return;
  }
  const memberWrite = await apiCall(request, member.session.token, "PATCH", "/cms/site-layout/draft", {
    layout: { version: 1 },
  });
  const memberRow = classifyExpectedStatus(memberWrite.status, 403, "O membro não grava o rascunho editorial.");
  keep(row("G/cms-membro-negado", "MEMBRO", "Membro não edita o site", memberRow.status, memberRow.detail), bucket);

  const first = await apiCall(request, editor.session.token, "GET", "/cms/site-layout");
  const draft = recordOf(recordOf(first.body)?.draft);
  const original = draft?.appearance;
  const marker = original === "verde" ? "dourado" : "verde";
  let saveStatus = 0;
  let markerSeen = false;
  let restored = false;
  if (draft && (original === "dourado" || original === "verde" || original === "marfim")) {
    const save = await apiCall(request, editor.session.token, "PATCH", "/cms/site-layout/draft", {
      layout: { ...draft, appearance: marker },
      expectedUpdatedAt: recordOf(first.body)?.draftUpdatedAt ?? null,
    });
    saveStatus = save.status;
    const reread = await apiCall(request, editor.session.token, "GET", "/cms/site-layout");
    markerSeen = recordOf(recordOf(reread.body)?.draft)?.appearance === marker;
    const back = await apiCall(request, editor.session.token, "PATCH", "/cms/site-layout/draft", {
      layout: { ...draft, appearance: original },
      expectedUpdatedAt: recordOf(reread.body)?.draftUpdatedAt ?? recordOf(save.body)?.draftUpdatedAt ?? null,
    });
    const finalRead = await apiCall(request, editor.session.token, "GET", "/cms/site-layout");
    restored = back.status === 200 && recordOf(recordOf(finalRead.body)?.draft)?.appearance === original;
  }
  const roundtrip = classifyDraftRoundtrip({
    readStatus: first.status,
    saveStatus,
    markerSeen,
    restored,
    publishedDuringTest: false,
  });
  keep(row("G/cms-rascunho", "EDITOR", "Rascunho editorial persistido e restaurado", roundtrip.status, roundtrip.detail), bucket);
  const publish = await apiCall(request, editor.session.token, "POST", "/cms/site-layout/publish", {});
  const publishRow = classifyExpectedStatus(publish.status, 403, "O editor não publica o site institucional.");
  keep(row("G/cms-editor-nao-publica", "EDITOR", "Editor não publica", publishRow.status, publishRow.detail), bucket);
  finish(bucket);
});

async function moduleLabels(page: Page): Promise<string[]> {
  const labels = await page.locator("nav[aria-label='Módulos'] a").evaluateAll((nodes) =>
    nodes
      .map((node) => (node.querySelector("span")?.textContent ?? "").trim())
      .filter((label) => label.length > 0),
  );
  return labels;
}

test("G percorre ficha, ministérios, agenda, finanças, eventos e menu no navegador", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const bucket: MatrixRow[] = [];
  if (!(await requireWeb(page, testInfo, "SECRETARIA", "G/ui-servidor"))) return;
  const signed = await loginUi(page, "ana.demo@example.test");
  if (!signed) {
    keep(row("G/ui-secretaria", "SECRETARIA", "Sessão de Secretaria", "BLOCKED", "O login de Secretaria não abriu módulo operacional."), bucket);
    finish(bucket);
    return;
  }
  const labels = await moduleLabels(page);
  const menu = classifyMenu("SECRETARIA", labels);
  keep(row("G/menu-secretaria", "SECRETARIA", "Menu por papel", menu.status, menu.detail), bucket);

  await page.goto("/app/membros/");
  const search = page.getByLabel("Buscar membros");
  await search.fill("Bruno");
  const open = page.getByRole("button", { name: "Abrir ficha de Bruno Demo Membro" });
  const canOpen = (await open.count()) > 0;
  if (canOpen) await open.click();
  const dialog = page.getByRole("dialog");
  const formReady = await dialog.getByText("Campos que a API grava").waitFor({ state: "visible", timeout: 15_000 }).then(() => true).catch(() => false);
  const dialogText = formReady ? await dialog.innerText() : "";
  const opened = canOpen && /Campos que a API grava/.test(dialogText) && /ainda não grava estes campos/.test(dialogText);
  const fichaShot = await shot(page, "g-ficha-1440");
  keep(row(
    "G/ficha-abrir",
    "SECRETARIA",
    "Buscar e abrir ficha na interface",
    opened ? "PASS" : "FAIL",
    opened
      ? "A busca isolou Bruno e a ficha separou campos graváveis dos campos só de consulta."
      : "A interface não abriu a ficha com o contrato de gravação visível.",
    { evidence: fichaShot },
  ), bucket);

  let saved = false;
  let reopened = false;
  if (opened) {
    const family = dialog.getByLabel("Família");
    const before = await family.inputValue().catch(() => "");
    const next = before ? "" : "demoHousehold01";
    try {
      await family.selectOption(next);
      await dialog.getByRole("button", { name: "Salvar campos permitidos" }).click();
      saved = await dialog
        .getByText("Ficha salva e reaberta com os dados devolvidos pela API.")
        .waitFor({ state: "visible", timeout: 15_000 })
        .then(() => family.inputValue())
        .then((value) => value === next)
        .catch(() => false);
      if (saved) {
        await dialog.getByRole("button", { name: "Reabrir ficha" }).click();
        reopened = await dialog
          .getByText("Ficha reaberta com os dados atuais da API.")
          .waitFor({ state: "visible", timeout: 15_000 })
          .then(() => family.inputValue())
          .then((value) => value === next)
          .catch(() => false);
      }
    } catch {
      saved = false;
    } finally {
      const restore = await openSession(page.request, PHASE_G_PERSONAS[2]);
      if (restore.session) {
        await apiCall(page.request, restore.session.token, "PATCH", `/persons/${BRUNO}`, { householdId: before || null });
      }
    }
  }
  keep(row(
    "G/ficha-editar",
    "SECRETARIA",
    "Editar campo permitido e persistir",
    saved ? "PASS" : "FAIL",
    saved
      ? "A família sintética foi alterada, salva e confirmada pela reabertura da API. O valor original foi restaurado em seguida."
      : "A edição do campo permitido não foi confirmada pela API na própria ficha.",
    { evidence: fichaShot },
  ), bucket);
  keep(row(
    "G/ficha-reabrir",
    "SECRETARIA",
    "Reabrir a mesma ficha",
    reopened ? "PASS" : "FAIL",
    reopened
      ? "Reabrir devolveu o valor gravado, sem substituí-lo por um rascunho local."
      : "A reabertura não mostrou o valor persistido.",
  ), bucket);

  await page.goto("/app/ministerios/");
  await page.getByText(/BLOCKED|501|não persiste|Integrantes do ministério/i).first().waitFor({ state: "visible", timeout: 20_000 }).catch(() => undefined);
  const ministryText = await page.locator("body").innerText();
  const ministryShot = await shot(page, "g-ministerios-1440");
  const honestMinistry = /MINISTRY_MEMBERSHIP_SCHEMA_BLOCKED|não persiste|BLOCKED/.test(ministryText) && !/Integrante registrado/.test(ministryText);
  keep(row(
    "G/ministerios-ui",
    "SECRETARIA",
    "Tela de vínculo não finge persistência",
    honestMinistry ? "PASS" : "FAIL",
    honestMinistry
      ? "A tela mostra o bloqueio do vínculo formal e não registra integrante."
      : "A tela de ministérios não deixou o bloqueio explícito ou afirmou integrante registrado.",
    { evidence: ministryShot },
  ), bucket);

  await page.goto("/eventos/");
  await page.getByRole("heading", { name: /nos aproximam|Próximos/i }).first().waitFor({ state: "visible", timeout: 15_000 }).catch(() => undefined);
  const eventsText = await page.locator("body").innerText();
  const eventsShot = await shot(page, "g-eventos-1440");
  const eventsHonest = !/pagar com pix|chave pix/i.test(eventsText);
  keep(row(
    "G/eventos-publicos",
    "PUBLICACAO",
    "Agenda pública sem cobrança",
    eventsHonest ? "PASS" : "FAIL",
    eventsHonest
      ? "A agenda pública não oferece Pix nem cobrança."
      : "A agenda pública apresentou ação de Pix.",
    { evidence: eventsShot },
  ), bucket);

  await page.goto("/login/");
  await page.evaluate(() => window.localStorage.clear());
  await page.evaluate(() => window.sessionStorage.clear());
  await page.goto("/login/");
  const memberIn = await loginUi(page, "bruno.demo@example.test");
  const memberLabels = memberIn ? await moduleLabels(page) : [];
  const memberMenu = classifyMenu("MEMBRO", memberLabels);
  const navShot = await shot(page, "g-nav-membro");
  keep(row("G/menu-membro", "MEMBRO", "Menu por papel", memberIn ? memberMenu.status : "BLOCKED", memberIn ? memberMenu.detail : "Login de membro não abriu o painel.", { evidence: navShot }), bucket);

  if (memberIn) {
    await page.goto("/app/servir/meu-espaco/");
    await page.getByRole("heading", { name: "Sua escala" }).waitFor({ state: "visible", timeout: 15_000 }).catch(() => undefined);
    const spaceText = await page.locator("body").innerText();
    await page.getByRole("button", { name: "Verificar se esta conta pode listar escalas" }).click();
    await page.locator("[data-probe]").waitFor({ state: "visible", timeout: 15_000 }).catch(() => undefined);
    const probe = await page.locator("[data-probe]").getAttribute("data-probe").catch(() => null);
    const names = await page.locator("[data-surface='membro'] li").count();
    const agenda = classifyOwnAgenda({
      listStatus: probe === "forbidden" ? 403 : probe === "allowed" ? 200 : 0,
      disclosesGap: /Não há consulta da agenda pessoal/.test(spaceText),
      renderedScheduleItems: names,
    });
    const spaceShot = await shot(page, "g-meu-espaco-1440");
    keep(row("G/agenda-honestidade", "MEMBRO", "Meu Espaço não finge agenda", agenda.honesty, agenda.honestyDetail, { evidence: spaceShot }), bucket);
    keep(row("G/agenda-persistencia", "MEMBRO", "Agenda própria persistida", agenda.persistence, agenda.persistenceDetail, { evidence: spaceShot }), bucket);

    await page.goto("/app/tesouraria/");
    await page.getByRole("heading", { name: /Recebido, a receber/ }).waitFor({ state: "visible", timeout: 15_000 }).catch(() => undefined);
    const metricTexts = await page.locator("article").filter({ hasText: /Receita recebida|A receber|Caixa liquidado|Despesa comprometida/ }).locator("strong").allTextContents();
    const financeText = await page.locator("body").innerText();
    const finance = classifyFinanceHonesty({ apiStatus: 403, metricTexts, pageText: financeText });
    const financeShot = await shot(page, "g-tesouraria-membro");
    keep(row("G/financeiro-membro", "MEMBRO", "Membro não vê saldo inventado", finance.status, finance.detail, { evidence: financeShot }), bucket);
  }

  await page.context().clearCookies();
  await page.evaluate(() => { window.localStorage.clear(); window.sessionStorage.clear(); }).catch(() => undefined);
  const treasurerIn = await loginUi(page, "tesouraria.demo@example.test");
  if (treasurerIn) {
    const treasuryLabels = await moduleLabels(page);
    const treasuryMenu = classifyMenu("TESOURARIA", treasuryLabels);
    keep(row("G/menu-tesouraria", "TESOURARIA", "Menu por papel", treasuryMenu.status, treasuryMenu.detail), bucket);
    await page.goto("/app/tesouraria/");
    await page.getByRole("heading", { name: /Recebido, a receber/ }).waitFor({ state: "visible", timeout: 15_000 });
    const position = await page.waitForFunction(() => {
      const values = [...document.querySelectorAll("article strong")].map((node) => node.textContent ?? "");
      return values.some((value) => /R\$\s*\d|Sem consulta/.test(value));
    }, { timeout: 15_000 }).then(() => true).catch(() => false);
    const metricTexts = await page.locator("article").filter({ hasText: /Receita recebida|A receber|Caixa liquidado|Despesa comprometida/ }).locator("strong").allTextContents();
    const financeText = await page.locator("body").innerText();
    const apiStatus = metricTexts.some((text) => /R\$\s*\d/.test(text)) ? 200 : 403;
    const finance = classifyFinanceHonesty({ apiStatus: position ? apiStatus : 0, metricTexts, pageText: financeText });
    const shotTreasury = await shot(page, "g-tesouraria-1440");
    keep(row("G/financeiro-tesouraria", "TESOURARIA", "Posição sintética sem Pix", finance.status, finance.detail, { evidence: shotTreasury }), bucket);
  } else {
    keep(row("G/financeiro-tesouraria", "TESOURARIA", "Posição sintética sem Pix", "BLOCKED", "Login de tesouraria não abriu o painel."), bucket);
  }
  finish(bucket);
});

test("G mede 360, 768, 1440, zoom 200% e teclado", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const bucket: MatrixRow[] = [];
  if (!(await requireWeb(page, testInfo, "SECRETARIA", "G/layout-servidor"))) return;

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/login/");
  const email = page.locator("#church-email");
  await email.waitFor({ state: "visible" });
  let reachedEmail = false;
  let reachedPassword = false;
  for (let step = 0; step < 20; step += 1) {
    await page.keyboard.press("Tab");
    const id = await page.evaluate(() => document.activeElement?.id ?? "");
    if (id === "church-email") reachedEmail = true;
    if (id === "church-password") reachedPassword = true;
  }
  const focus = await page.evaluate(() => {
    const field = document.querySelector<HTMLElement>("#church-password");
    field?.focus();
    if (!field) return { width: 0, shadow: "none" };
    const style = getComputedStyle(field);
    return { width: Number.parseFloat(style.outlineWidth) || 0, shadow: style.boxShadow };
  });
  const focusVerdict = classifyFocusVisible(focus.width, focus.shadow);
  const focusShot = await shot(page, "g-foco-teclado");
  keep(row(
    "G/teclado-login",
    "PUBLICACAO",
    "Tab alcança e-mail e senha",
    reachedEmail && reachedPassword ? "PASS" : "FAIL",
    reachedEmail && reachedPassword
      ? "Tab chegou aos dois campos sem uso do mouse."
      : `E-mail por teclado: ${reachedEmail}. Senha por teclado: ${reachedPassword}.`,
    { evidence: focusShot },
  ), bucket);
  keep(row(
    "G/foco-visivel",
    "PUBLICACAO",
    "Foco visível no campo de senha",
    focusVerdict,
    focusVerdict === "PASS"
      ? "O campo focado tem contorno ou sombra."
      : "O campo focado não tem contorno nem sombra.",
    { evidence: focusShot },
  ), bucket);

  const signed = await loginUi(page, "ana.demo@example.test");
  if (!signed) {
    keep(row("G/layout", "SECRETARIA", "Layout autenticado", "BLOCKED", "Login não abriu o painel."), bucket);
    finish(bucket);
    return;
  }
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog");
  const opened = await palette.waitFor({ state: "visible", timeout: 5_000 }).then(() => true).catch(() => false);
  if (opened) await page.keyboard.press("Escape");
  const closed = opened ? await palette.waitFor({ state: "hidden", timeout: 5_000 }).then(() => true).catch(() => false) : false;
  keep(row(
    "G/teclado-atalho",
    "SECRETARIA",
    "Ctrl K abre a busca e Esc fecha",
    opened && closed ? "PASS" : "FAIL",
    opened && closed ? "O atalho de teclado abriu e fechou a busca de módulos." : `Abriu: ${opened}. Fechou: ${closed}.`,
  ), bucket);

  const viewports = [
    { width: 360, height: 800, name: "360" },
    { width: 768, height: 1024, name: "768" },
    { width: 1440, height: 900, name: "1440" },
  ];
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto("/app/secretaria/");
    await page.getByRole("heading", { name: /Protocolos de admissão|Admissões e secretaria|Cuidar de cada etapa/ }).first().waitFor({ state: "visible", timeout: 15_000 }).catch(() => undefined);
    const overflow = await horizontalOverflow(page);
    const evidence = await shot(page, `g-secretaria-${viewport.name}`);
    const verdict = classifyOverflow(overflow);
    keep(row(
      `G/layout-secretaria-${viewport.name}`,
      "SECRETARIA",
      `Secretaria em ${viewport.name}px`,
      verdict,
      verdict === "PASS"
        ? `Sem overflow horizontal (${overflow}px).`
        : `Overflow horizontal de ${overflow}px.`,
      { evidence },
    ), bucket);
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/secretaria/");
  const colors = await page.evaluate(() => {
    function parse(color: string): [number, number, number] | null {
      const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!match) return null;
      return [Number(match[1]), Number(match[2]), Number(match[3])];
    }
    function paint(element: Element | null): { fg: [number, number, number] | null; bg: [number, number, number] | null } {
      let node = element instanceof HTMLElement ? element : null;
      const fg = node ? parse(getComputedStyle(node).color) : null;
      let bg: [number, number, number] | null = null;
      while (node) {
        const style = getComputedStyle(node);
        const alpha = style.backgroundColor.match(/rgba\(\d+,\s*\d+,\s*\d+,\s*([0-9.]+)\)/);
        if (style.backgroundColor.startsWith("rgb(") || (alpha && Number(alpha[1]) > 0.4)) {
          bg = parse(style.backgroundColor);
          break;
        }
        node = node.parentElement;
      }
      return { fg, bg };
    }
    return {
      body: paint(document.body),
      heading: paint(document.querySelector("h1, h2")),
    };
  });
  const samples = [colors.body, colors.heading].filter((sample) => sample.fg && sample.bg) as Array<{ fg: [number, number, number]; bg: [number, number, number] }>;
  const ratios = samples.map((sample) => contrastRatio(sample.fg, sample.bg));
  const worst = ratios.length ? Math.min(...ratios) : 0;
  const contrastVerdict = ratios.length ? classifyContrast(worst, false) : "FAIL";
  keep(row(
    "G/contraste",
    "SECRETARIA",
    "Contraste de texto no módulo",
    contrastVerdict,
    ratios.length
      ? `Menor razão medida: ${worst.toFixed(2)}:1. O mínimo de texto comum é 4.5:1.`
      : "Não foi possível ler a cor do texto e do fundo.",
  ), bucket);

  await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
  const zoomOverflow = await horizontalOverflow(page);
  const zoomShot = await shot(page, "g-zoom-200-secretaria");
  const zoomVerdict = classifyOverflow(zoomOverflow);
  keep(row(
    "G/zoom-200",
    "SECRETARIA",
    "Zoom 200% na Secretaria",
    zoomVerdict,
    zoomVerdict === "PASS"
      ? `Zoom 200% sem overflow horizontal (${zoomOverflow}px).`
      : `Zoom 200% gerou overflow horizontal de ${zoomOverflow}px.`,
    { evidence: zoomShot },
  ), bucket);
  await page.evaluate(() => { document.documentElement.style.zoom = "1"; });

  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/app/ministerios/");
  await page.getByText("MINISTRY_MEMBERSHIP_SCHEMA_BLOCKED").first().waitFor({ state: "visible", timeout: 20_000 });
  const mobileOverflow = await horizontalOverflow(page);
  const mobileShot = await shot(page, "g-ministerios-360");
  const mobileVerdict = classifyOverflow(mobileOverflow);
  keep(row(
    "G/layout-ministerios-360",
    "SECRETARIA",
    "Vínculo de ministério em 360px",
    mobileVerdict,
    mobileVerdict === "PASS" ? `Sem overflow horizontal (${mobileOverflow}px).` : `Overflow horizontal de ${mobileOverflow}px.`,
    { evidence: mobileShot },
  ), bucket);
  finish(bucket);
});

test("G confere o link oficial sem enviar credencial", async ({ page }) => {
  const bucket: MatrixRow[] = [];
  let httpStatus = 0;
  try {
    const response = await page.goto(PAGES, { waitUntil: "domcontentloaded", timeout: 30_000 });
    httpStatus = response?.status() ?? 0;
  } catch {
    httpStatus = 0;
  }
  if (httpStatus === 0) {
    keep(row("G/pages-home", "PUBLICACAO", "Link oficial", "BLOCKED", "O GitHub Pages oficial não respondeu."), bucket);
    finish(bucket);
    return;
  }
  const homeText = await page.locator("body").innerText();
  const homeShot = await shot(page, "g-pages-home");
  const portalOk = /Quem Somos|quem somos/i.test(homeText) && /Agenda|encontros/i.test(homeText) && !/Tesouraria/.test(homeText);
  keep(row(
    "G/pages-home",
    "PUBLICACAO",
    "Portal oficial sem módulo financeiro",
    httpStatus === 200 && portalOk ? "PASS" : "FAIL",
    httpStatus === 200 && portalOk
      ? "A home oficial mostra a superfície pública e não a tesouraria."
      : `HTTP ${httpStatus}. A home oficial não ficou restrita ao portal público.`,
    { evidence: homeShot },
  ), bucket);

  const loginUrl = new URL("login/", PAGES).toString();
  const loginResponse = await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
  const button = page.getByRole("button", { name: "Entrar no painel" });
  const visible = await button.waitFor({ state: "visible", timeout: 15_000 }).then(() => true).catch(() => false);
  const disabled = visible ? await button.isDisabled() : false;
  const loginText = await page.locator("body").innerText();
  const refuses = /nenhuma credencial será enviada/i.test(loginText);
  const loginShot = await shot(page, "g-pages-login");
  const formReady = (loginResponse?.status() ?? 0) === 200 && visible && !disabled && !refuses;
  keep(row(
    "G/pages-login",
    "PUBLICACAO",
    "Formulário oficial habilitado",
    formReady ? "BLOCKED" : classifyPublicationGate({
      httpStatus: loginResponse?.status() ?? 0,
      buttonDisabled: disabled,
      refusesCredential: refuses,
    }).status,
    formReady
      ? "O botão de entrar do link oficial está habilitado. O workflow da main publica esse site com a API HML. Nenhuma credencial foi enviada daqui."
      : classifyPublicationGate({
          httpStatus: loginResponse?.status() ?? 0,
          buttonDisabled: disabled,
          refusesCredential: refuses,
        }).detail,
    { evidence: loginShot },
  ), bucket);
  let remoteHealth = 0;
  let remoteContract = "";
  try {
    const health = await page.request.get("https://id-riacho1-api-hml.vercel.app/health", { timeout: 20_000 });
    remoteHealth = health.status();
    const meta = await page.request.get("https://id-riacho1-api-hml.vercel.app/meta", { timeout: 20_000 });
    const body = meta.ok() ? await meta.json() as { contractVersion?: unknown } : null;
    remoteContract = typeof body?.contractVersion === "string" ? body.contractVersion : "";
  } catch {
    remoteHealth = 0;
  }
  keep(row(
    "G/pages-hml",
    "PLATAFORMA",
    "Jornadas autenticadas no link oficial",
    "BLOCKED",
    remoteHealth === 200
      ? `GET /health da API HML pública respondeu 200${remoteContract ? ` e /meta anuncia o contrato ${remoteContract}` : ""}. Não enviei credencial e não tratei esse anúncio como prova de ficha, vínculo, agenda ou editor. A matriz autenticada é da API sintética local.`
      : `GET /health da API HML pública respondeu HTTP ${remoteHealth}. Nenhuma credencial foi enviada. As jornadas autenticadas do link oficial ficam bloqueadas.`,
  ), bucket);
  finish(bucket);
});
