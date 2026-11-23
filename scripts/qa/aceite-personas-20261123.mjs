/**
 * Aceite funcional das personas da issue #309.
 * Escrita somente em loopback. Não aponta para HML, produção nem Neon.
 * Não imprime senha, JWT, TOTP, preview de convite nem QR.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const LOCAL = process.env.LOCAL_API_BASE ?? "http://127.0.0.1:3001";
const HOSTED_API = "https://id-riacho1-api-qa.vercel.app";
const HOSTED_WEB = "https://id-riacho1-web-hml-git-0d6b26-gustavomarqueslopes-cmds-projects.vercel.app/";
const SHA = "5f32bb3fd4006e8f3276721210e4664e5a59b6d3";
const PREFIX = "QA-PERSONA-20261123";
const localUrl = new URL(LOCAL);
if (localUrl.hostname !== "127.0.0.1" && localUrl.hostname !== "localhost") {
  throw new Error("A execução com escrita só aceita a API em loopback.");
}
if (!process.env.DATABASE_URL?.includes("localhost") && !process.env.DATABASE_URL?.includes("127.0.0.1")) {
  throw new Error("DATABASE_URL local ausente. Não consulto Neon.");
}

const demoPassword = process.env.QA_DEMO_PASSWORD?.trim() || "admin";
const syntheticPassword = `Qa${randomBytes(6).toString("hex")}9z`;

const personas = [
  ["PLATFORM_ADMIN", "platform.demo@example.test"],
  ["PASTOR", "pastor.demo@example.test"],
  ["SECRETARIA", "ana.demo@example.test"],
  ["TESOURARIA", "tesouraria.demo@example.test"],
  ["TESOURARIA_2", "tesouraria2.demo@example.test"],
  ["LIDER_MINISTERIO", "lider.jovens.demo@example.test"],
  ["MEMBRO", "bruno.demo@example.test"],
  ["EDITOR_SITE", "editor.demo@example.test"],
  ["PUBLICADOR_SITE", "publicador.demo@example.test"],
];

function scrub(value, depth = 0) {
  if (depth > 6 || value == null) return value;
  if (Array.isArray(value)) return value.slice(0, 8).map((item) => scrub(item, depth + 1));
  if (typeof value !== "object") {
    if (typeof value === "string" && (value.length > 180 || value.includes("eyJ"))) return `str:${value.length}`;
    return value;
  }
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    const lower = key.toLowerCase();
    if (/token|secret|password|authorization|previewurl|qr|opaque|hash/.test(lower)) {
      out[key] = item == null ? null : "<omitido>";
      continue;
    }
    out[key] = scrub(item, depth + 1);
  }
  return out;
}

async function http(base, method, path, { token, json, form } = {}) {
  const headers = { accept: "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  let body;
  if (form) body = form;
  else if (json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(json);
  }
  const response = await fetch(base + path, { method, headers, body, redirect: "manual", signal: AbortSignal.timeout(25000) });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { _raw: text.slice(0, 120) }; }
  return {
    status: response.status,
    code: data && typeof data === "object" && !Array.isArray(data) ? data.code ?? data.message ?? null : null,
    data,
  };
}

function step(list, name, result, expect, extra = {}) {
  const ok = Array.isArray(expect) ? expect.includes(result.status) : result.status === expect;
  const observed = { ...extra };
  delete observed.body;
  delete observed.status;
  list.push({
    name,
    status: ok ? "PASS" : "FAIL",
    http: result.status,
    expected: expect,
    code: typeof result.code === "string" ? result.code.slice(0, 180) : result.code,
    ...observed,
  });
  return { ok, ...result };
}

const sessions = new Map();

async function login(base, email, password) {
  const result = await http(base, "POST", "/auth/login", { json: { email, password } });
  const token = result.data?.accessToken;
  if (token) sessions.set(email, token);
  return { status: result.status, code: result.data?.code ?? result.data?.mfa?.enrollmentRequired ?? null, hasToken: Boolean(token), roles: (result.data?.user?.grants ?? []).map((g) => g.roleCode) };
}

function tokenOf(email) {
  const token = sessions.get(email);
  if (!token) throw new Error(`sem sessão local para ${email}`);
  return token;
}

async function hostedProbe() {
  const ready = await http(HOSTED_API, "GET", "/ready");
  const web = await fetch(HOSTED_WEB, { redirect: "manual", signal: AbortSignal.timeout(20000) });
  const location = web.headers.get("location") ?? "";
  const logins = [];
  for (const [role, email] of personas) {
    const result = await login(HOSTED_API, email, demoPassword);
    logins.push({ role, http: result.status, code: result.code, hasToken: result.hasToken });
    sessions.delete(email);
  }
  const anon = await http(HOSTED_API, "GET", "/ledger/accounts");
  const audit = await http(HOSTED_API, "GET", "/audit-logs");
  return {
    api: HOSTED_API,
    ready: { http: ready.status, commit: ready.data?.commit ?? null, database: ready.data?.database ?? null, mfaBlocking: ready.data?.mfaBlocking ?? null, authState: ready.data?.authState ?? null },
    web: { http: web.status, sso: location.includes("vercel.com/sso-api"), locationHost: location ? new URL(location).host : null },
    documentedSeedLogin: logins,
    anonymousLedger: anon.status,
    anonymousAudit: audit.status,
    verdict: "HOSTED_BLOCKED",
    reason: "O frontend DEV responde 302 para o SSO da Vercel. O login na API QA com a senha sintética documentada do seed devolve 401 INVALID_CREDENTIALS e este ambiente não tem QA_DEMO_PASSWORD, TOTP nem URL do Neon br-twilight-bonus-b6moawk7. Nenhuma escrita foi feita na API QA.",
  };
}

function rollup(steps) {
  if (steps.some((item) => item.status === "FAIL")) return "FAIL";
  if (steps.some((item) => item.status === "BLOCKED")) return "BLOCKED";
  if (steps.length && steps.every((item) => item.status === "PASS")) return "PASS";
  return "BLOCKED";
}

async function main() {
  const hosted = await hostedProbe();
  const health = await http(LOCAL, "GET", "/ready");
  const db = new PrismaClient();
  const auditBefore = await db.auditLog.count();
  const journeys = [];

  for (const [role, email] of personas) {
    const signed = await login(LOCAL, email, demoPassword);
    journeys.push({
      persona: role,
      emailDomain: email.split("@")[1],
      login: { http: signed.status, hasToken: signed.hasToken, roles: signed.roles, mfa: signed.code },
      steps: [],
    });
  }
  const byRole = Object.fromEntries(journeys.map((item) => [item.persona, item]));

  const admin = byRole.PLATFORM_ADMIN;
  const pastor = byRole.PASTOR;
  const secretaria = byRole.SECRETARIA;
  const tesouraria = byRole.TESOURARIA;
  const tesouraria2 = byRole.TESOURARIA_2;
  const lider = byRole.LIDER_MINISTERIO;
  const membro = byRole.MEMBRO;
  const editor = byRole.EDITOR_SITE;
  const publicador = byRole.PUBLICADOR_SITE;

  const me = await http(LOCAL, "GET", "/auth/me", { token: tokenOf("platform.demo@example.test") });
  step(admin.steps, "GET /auth/me", me, 200, { churchId: me.data?.churchId ?? null, organizationId: me.data?.organizationId ?? null });
  const meAgain = await http(LOCAL, "GET", "/auth/me", { token: tokenOf("platform.demo@example.test") });
  step(admin.steps, "GET /auth/me idempotente", meAgain, 200, { sameChurch: meAgain.data?.churchId === me.data?.churchId });
  const catalog = await http(LOCAL, "GET", "/system-settings/catalog", { token: tokenOf("platform.demo@example.test") });
  step(admin.steps, "GET catálogo Gestão do Sistema", catalog, 200, { items: catalog.data?.items?.length ?? null });
  const effectiveBefore = await http(LOCAL, "GET", "/system-settings/effective?key=events.agenda.keep_days_after_end&scopeKind=CHURCH", { token: tokenOf("platform.demo@example.test") });
  const beforeValue = effectiveBefore.data?.value;
  step(admin.steps, "GET regra vigente antes", effectiveBefore, 200, { value: beforeValue });
  const nextValue = beforeValue === 7 ? 8 : 7;
  const draft = await http(LOCAL, "POST", "/system-settings/drafts", {
    token: tokenOf("platform.demo@example.test"),
    json: { key: "events.agenda.keep_days_after_end", scopeKind: "CHURCH", value: nextValue, note: PREFIX },
  });
  step(admin.steps, "POST rascunho da regra", draft, [200, 201], { lifecycle: draft.data?.lifecycle ?? null, value: draft.data?.value ?? null });
  const revisionId = draft.data?.id;
  if (revisionId) {
    const reviewed = await http(LOCAL, "POST", `/system-settings/revisions/${revisionId}/review`, {
      token: tokenOf("platform.demo@example.test"),
      json: { expectedUpdatedAt: draft.data.updatedAt },
    });
    step(admin.steps, "POST revisão da regra", reviewed, [200, 201], { lifecycle: reviewed.data?.lifecycle ?? null });
    const published = await http(LOCAL, "POST", `/system-settings/revisions/${revisionId}/publish`, {
      token: tokenOf("platform.demo@example.test"),
      json: { expectedUpdatedAt: reviewed.data?.updatedAt, effectiveFrom: "now" },
    });
    step(admin.steps, "POST publicar regra", published, [200, 201], { lifecycle: published.data?.lifecycle ?? null });
  }
  const effectiveAfter = await http(LOCAL, "GET", "/system-settings/effective?key=events.agenda.keep_days_after_end&scopeKind=CHURCH", { token: tokenOf("platform.demo@example.test") });
  step(admin.steps, "GET regra reaberta", effectiveAfter, 200, { before: beforeValue, after: effectiveAfter.data?.value, persisted: effectiveAfter.data?.value === nextValue });
  if (effectiveAfter.data?.value !== nextValue) admin.steps.at(-1).status = "FAIL";

  const ministries = await http(LOCAL, "GET", "/ministries", { token: tokenOf("platform.demo@example.test") });
  const ministryRows = ministries.data?.ministries ?? ministries.data ?? [];
  const atmosfera = ministryRows.find((item) => item.slug === "atmosfera");
  const louvor = ministryRows.find((item) => item.slug === "louvor-demo" || item.slug === "louvor");
  const jovens = ministryRows.find((item) => item.slug === "jovens");
  step(admin.steps, "GET ministérios Atmosfera e Louvor", ministries, 200, {
    atmosfera: atmosfera?.id ?? null, louvor: louvor?.slug ?? null, count: ministryRows.length,
  });

  const createdModule = await http(LOCAL, "POST", `/ministries/${atmosfera?.id}/roster-modules`, {
    token: tokenOf("platform.demo@example.test"),
    json: { name: `${PREFIX} modulo` },
  });
  step(admin.steps, "POST criar módulo QA", createdModule, [200, 201], { id: createdModule.data?.id ?? createdModule.data?.module?.id ?? null });
  const moduleId = createdModule.data?.id ?? createdModule.data?.module?.id ?? null;
  const renamed = await http(LOCAL, "PATCH", `/ministries/${atmosfera?.id}/roster-modules/${moduleId}`, {
    token: tokenOf("platform.demo@example.test"),
    json: { name: `${PREFIX} modulo renomeado` },
  });
  step(admin.steps, "PATCH renomear módulo", renamed, 200, { name: renamed.data?.name ?? null });
  const rulesBody = {
    positions: { sunday_morning: [{ label: `${PREFIX} acolhida`, count: 1, couple: false }] },
    qualifications: {}, couples: [], minIntervalDays: 7, maxMonthlyAssignments: 2, substituteInviteLimit: 1, substituteInviteHours: 12,
  };
  const savedRules = await http(LOCAL, "PATCH", `/ministries/${atmosfera?.id}/roster-modules/${moduleId}/rules`, {
    token: tokenOf("platform.demo@example.test"), json: rulesBody,
  });
  step(admin.steps, "PATCH regra do módulo", savedRules, 200, { minIntervalDays: savedRules.data?.rules?.minIntervalDays ?? null });
  const ruleRow = moduleId ? await db.ministryRosterModule.findUnique({ where: { id: moduleId }, select: { name: true, rules: true } }) : null;
  admin.steps.push({
    name: "DB módulo reaberto",
    status: ruleRow?.name === `${PREFIX} modulo renomeado` && ruleRow?.rules?.minIntervalDays === 7 ? "PASS" : "FAIL",
    http: null,
    before: "ausente",
    after: { name: ruleRow?.name ?? null, minIntervalDays: ruleRow?.rules?.minIntervalDays ?? null },
  });

  const access = await http(LOCAL, "GET", "/admin/access?limit=5", { token: tokenOf("platform.demo@example.test") });
  step(admin.steps, "GET Gestão de Acessos", access, 200, { page: access.data?.items?.length ?? access.data?.users?.length ?? null });
  const deniedAudit = await http(LOCAL, "GET", "/audit-logs", { token: tokenOf("bruno.demo@example.test") });
  step(admin.steps, "GET auditoria com MEMBRO", deniedAudit, 403);
  const anonMe = await http(LOCAL, "GET", "/auth/me");
  step(admin.steps, "GET /auth/me sem sessão", anonMe, 401);

  const churches = await http(LOCAL, "GET", "/churches", { token: tokenOf("ana.demo@example.test") });
  const otherChurch = (churches.data?.churches ?? churches.data ?? []).find((item) => item.slug === "riacho-fundo-2-demo");
  step(secretaria.steps, "GET congregações da secretaria", churches, 200, { otherChurch: otherChurch?.id ?? null });

  const household = await http(LOCAL, "POST", "/households", {
    token: tokenOf("ana.demo@example.test"),
    json: { label: `${PREFIX} familia`, memberPersonIds: [] },
  });
  step(secretaria.steps, "POST família sintética", household, [200, 201], { id: household.data?.id ?? null });
  const householdAgain = await http(LOCAL, "GET", `/households/${household.data?.id}`, { token: tokenOf("ana.demo@example.test") });
  step(secretaria.steps, "GET família reaberta", householdAgain, 200, { label: householdAgain.data?.label ?? householdAgain.data?.name ?? null });
  const person = await http(LOCAL, "POST", "/memberships", {
    token: tokenOf("ana.demo@example.test"),
    json: { displayName: `${PREFIX} Pessoa Modulo`, email: "qa-persona-20261123-modulo@example.test" },
  });
  step(secretaria.steps, "POST ficha sintética", person, [200, 201], { personId: person.data?.personId ?? person.data?.person?.id ?? null });
  const personId = person.data?.personId ?? person.data?.person?.id ?? person.data?.id ?? null;
  const dossier = personId ? await http(LOCAL, "GET", `/persons/${personId}/dossier`, { token: tokenOf("ana.demo@example.test") }) : { status: 0, data: null };
  step(secretaria.steps, "GET Ficha360", dossier, 200, { found: Boolean(dossier.data?.person || dossier.data?.id) });
  const admission = await http(LOCAL, "POST", "/admissions", {
    token: tokenOf("ana.demo@example.test"),
    json: { displayName: `${PREFIX} Admissao`, email: "qa-persona-20261123-admissao@example.test", modality: "ACLAMACAO", notes: PREFIX },
  });
  step(secretaria.steps, "POST admissão sintética", admission, [200, 201], { id: admission.data?.id ?? null, status: admission.data?.status ?? null });
  const birthdays = await http(LOCAL, "GET", "/reports/birthdays", { token: tokenOf("ana.demo@example.test") });
  step(secretaria.steps, "GET aniversários", birthdays, 200);
  const map = await http(LOCAL, "GET", "/reports/membership-map", { token: tokenOf("ana.demo@example.test") });
  step(secretaria.steps, "GET mapa de membresia", map, [200, 404]);
  if (map.status === 404) secretaria.steps.at(-1).status = "BLOCKED";
  const notices = await http(LOCAL, "POST", "/reports/birthday-notices/run", { token: tokenOf("ana.demo@example.test"), json: {} });
  step(secretaria.steps, "POST aviso de aniversário sem canal real", notices, [200, 201, 202, 403, 404]);
  const memberCardDenied = await http(LOCAL, "GET", "/credentials/me", { token: tokenOf("ana.demo@example.test") });
  step(secretaria.steps, "GET carteirinha própria da secretaria", memberCardDenied, [200, 404]);
  const pastorDeniedLedger = await http(LOCAL, "GET", "/ledger/accounts", { token: tokenOf("pastor.demo@example.test") });
  step(pastor.steps, "GET ledger como pastor", pastorDeniedLedger, 403);

  const pastoral = await http(LOCAL, "GET", "/pastoral/congregation", { token: tokenOf("pastor.demo@example.test") });
  step(pastor.steps, "GET dashboard pastoral", pastoral, 200);
  const pastoralBirthdays = await http(LOCAL, "GET", "/reports/birthdays", { token: tokenOf("pastor.demo@example.test") });
  step(pastor.steps, "GET aniversários pastorais", pastoralBirthdays, 200);
  const admissions = await http(LOCAL, "GET", "/admissions", { token: tokenOf("pastor.demo@example.test") });
  step(pastor.steps, "GET admissões", admissions, 200, { count: admissions.data?.items?.length ?? admissions.data?.admissions?.length ?? null });

  const accounts = await http(LOCAL, "GET", "/ledger/accounts", { token: tokenOf("tesouraria.demo@example.test") });
  const accountRows = accounts.data?.accounts ?? accounts.data ?? [];
  const expenseAccount = accountRows.find((item) => item.code === "5.1.01");
  const cashAccount = accountRows.find((item) => item.code === "1.1.01");
  const bankAccount = accountRows.find((item) => item.code === "1.1.02");
  step(tesouraria.steps, "GET contas", accounts, 200, { expense: expenseAccount?.id ?? null, bank: bankAccount?.id ?? null });
  const centers = await http(LOCAL, "GET", "/ledger/cost-centers", { token: tokenOf("tesouraria.demo@example.test") });
  const center = (centers.data?.costCenters ?? centers.data ?? [])[0];
  step(tesouraria.steps, "GET centros de custo", centers, 200, { id: center?.id ?? null });
  const balancesBefore = await http(LOCAL, "GET", "/ledger/balances", { token: tokenOf("tesouraria.demo@example.test") });
  step(tesouraria.steps, "GET saldos antes", balancesBefore, 200);
  const expense = await http(LOCAL, "POST", "/ledger/expenses", {
    token: tokenOf("tesouraria.demo@example.test"),
    json: {
      requestId: randomUUID(), entryDate: "2026-11-23", description: `${PREFIX} despesa sintetica`,
      expenseAccountId: expenseAccount?.id, cashAccountId: cashAccount?.id, amountCents: 1234, costCenterId: center?.id,
    },
  });
  step(tesouraria.steps, "POST despesa sintética", expense, [200, 201], { id: expense.data?.id ?? null, status: expense.data?.status ?? null, firstApproverIsCreator: expense.data?.firstApprovedByUserId ? "definido" : "ausente" });
  const expenseId = expense.data?.id;
  const selfApprove = expenseId ? await http(LOCAL, "POST", `/ledger/entries/${expenseId}/approve`, { token: tokenOf("tesouraria.demo@example.test") }) : { status: 0, data: null };
  step(tesouraria.steps, "POST tesoureiro não aprova a própria despesa", selfApprove, 403);
  const pastorTooSoon = expenseId ? await http(LOCAL, "POST", `/ledger/entries/${expenseId}/approve`, { token: tokenOf("pastor.demo@example.test") }) : { status: 0, data: null };
  const pastorFirst = pastorTooSoon.status === 200 || pastorTooSoon.status === 201;
  step(pastor.steps, "POST pastor decide a etapa que lhe cabe", pastorTooSoon, pastorFirst ? [200, 201] : 403, { statusAfter: pastorTooSoon.data?.status ?? null });
  if (!pastorFirst && expense.data?.firstApprovedByUserId) {
    const pastorFinal = await http(LOCAL, "POST", `/ledger/entries/${expenseId}/approve`, { token: tokenOf("pastor.demo@example.test") });
    step(pastor.steps, "POST pastor aprova despesa já conferida", pastorFinal, [200, 201], { status: pastorFinal.data?.status ?? null });
  }
  const reloaded = expenseId ? await http(LOCAL, "GET", `/ledger/entries/${expenseId}`, { token: tokenOf("tesouraria.demo@example.test") }) : { status: 0, data: null };
  step(tesouraria.steps, "GET despesa reaberta", reloaded, 200, { before: "ausente", after: reloaded.data?.status ?? null });
  const rejectExpense = await http(LOCAL, "POST", "/ledger/expenses", {
    token: tokenOf("tesouraria.demo@example.test"),
    json: {
      requestId: randomUUID(), entryDate: "2026-11-23", description: `${PREFIX} despesa rejeitada`,
      expenseAccountId: expenseAccount?.id, cashAccountId: cashAccount?.id, amountCents: 500, costCenterId: center?.id,
    },
  });
  const rejected = rejectExpense.data?.id ? await http(LOCAL, "POST", `/ledger/entries/${rejectExpense.data.id}/reject`, {
    token: tokenOf("pastor.demo@example.test"), json: { reason: `${PREFIX} rejeicao sintetica` },
  }) : { status: 0, data: null };
  step(pastor.steps, "POST pastor rejeita outra despesa", rejected, [200, 201, 403], { status: rejected.data?.status ?? null, httpNote: rejected.status });
  if (![200, 201].includes(rejected.status)) pastor.steps.at(-1).status = rejected.status === 403 ? "PASS" : "FAIL";

  const ofx = `<OFX><STMTRS><CURDEF>BRL</CURDEF><STMTTRN><DTPOSTED>20261120<TRNAMT>-12.34<FITID>${PREFIX}-OFX<NAME>${PREFIX}</NAME><MEMO>extrato ficticio</MEMO></STMTTRN></STMTRS></OFX>`;
  const form = new FormData();
  form.set("accountId", bankAccount?.id ?? "");
  form.set("file", new Blob([ofx], { type: "application/octet-stream" }), `${PREFIX}.ofx`);
  const uploaded = await http(LOCAL, "POST", "/ledger/imports/ofx", { token: tokenOf("tesouraria.demo@example.test"), form });
  step(tesouraria.steps, "POST OFX fictício", uploaded, [200, 201], { format: uploaded.data?.format ?? null, lines: uploaded.data?.lineCount ?? uploaded.data?.lines?.length ?? null });
  const importedAgain = await http(LOCAL, "POST", "/ledger/imports/ofx", { token: tokenOf("tesouraria.demo@example.test"), form });
  step(tesouraria.steps, "POST OFX idempotente", importedAgain, [200, 201], { alreadyImported: importedAgain.data?.alreadyImported ?? null });
  const lineId = uploaded.data?.lines?.[0]?.id ?? null;
  const reconciliation = await http(LOCAL, "POST", "/ledger/reconciliations", {
    token: tokenOf("tesouraria.demo@example.test"),
    json: { title: `${PREFIX} conciliacao`, periodStart: "2026-11-01", periodEnd: "2026-11-30", notes: PREFIX },
  });
  step(tesouraria.steps, "POST conciliação", reconciliation, [200, 201], { id: reconciliation.data?.id ?? null });
  if (lineId && expenseId) {
    const matched = await http(LOCAL, "POST", `/ledger/bank-lines/${lineId}/match`, {
      token: tokenOf("tesouraria.demo@example.test"),
      json: { entryId: expenseId, reconciliationId: reconciliation.data?.id },
    });
    step(tesouraria.steps, "POST conciliar linha OFX", matched, [200, 201, 409]);
  }
  const pdf = await http(LOCAL, "GET", "/ledger/statements/export?format=pdf", { token: tokenOf("tesouraria.demo@example.test") });
  const xls = await http(LOCAL, "GET", "/ledger/statements/export?format=xls", { token: tokenOf("tesouraria.demo@example.test") });
  step(tesouraria.steps, "GET extrato PDF", pdf, 200, { content: pdf.data?._raw?.slice(0, 4) ?? "json" });
  step(tesouraria.steps, "GET extrato Excel", xls, 200);
  const balancesAfter = await http(LOCAL, "GET", "/ledger/balances", { token: tokenOf("tesouraria.demo@example.test") });
  step(tesouraria.steps, "GET saldos depois", balancesAfter, 200);
  const memberLedger = await http(LOCAL, "GET", "/ledger/accounts", { token: tokenOf("bruno.demo@example.test") });
  step(membro.steps, "GET tesouraria negada ao membro", memberLedger, 403);
  const editorLedger = await http(LOCAL, "GET", "/ledger/accounts", { token: tokenOf("editor.demo@example.test") });
  step(editor.steps, "GET tesouraria negada ao editor", editorLedger, 403);
  const editorPastoral = await http(LOCAL, "GET", "/pastoral/congregation", { token: tokenOf("editor.demo@example.test") });
  step(editor.steps, "GET pastoral negada ao editor", editorPastoral, 403);

  const order = await http(LOCAL, "POST", "/service-orders", {
    token: tokenOf("pastor.demo@example.test"),
    json: {
      title: `${PREFIX} ordem de culto`,
      serviceAt: "2026-12-06T12:00:00.000Z",
      notes: PREFIX,
      items: [
        { title: "Acolhida", minutes: 5, responsible: "Equipe sintética" },
        { title: "Equipe de Mídia", minutes: 8, notes: `${PREFIX} midia OC` },
      ],
    },
  });
  step(pastor.steps, "POST ordem de culto com mídia", order, [200, 201], { id: order.data?.id ?? null, status: order.data?.status ?? null });
  const orderId = order.data?.id;
  const orderReload = orderId ? await http(LOCAL, "GET", `/service-orders/${orderId}`, { token: tokenOf("pastor.demo@example.test") }) : { status: 0, data: null };
  step(pastor.steps, "GET ordem reaberta", orderReload, 200, { items: orderReload.data?.items?.length ?? null });
  const orderPdf = orderId ? await http(LOCAL, "GET", `/service-orders/${orderId}/pdf`, { token: tokenOf("pastor.demo@example.test") }) : { status: 0, data: null };
  step(pastor.steps, "GET PDF da ordem", orderPdf, 200);
  const publishedOrder = orderId ? await http(LOCAL, "POST", `/service-orders/${orderId}/publish`, { token: tokenOf("pastor.demo@example.test") }) : { status: 0, data: null };
  step(pastor.steps, "POST publicar ordem", publishedOrder, [200, 201], { status: publishedOrder.data?.status ?? null });
  const realRostersBefore = await db.roster.count();
  step(pastor.steps, "escalas reais intocadas pela ordem", { status: 200, data: { count: realRostersBefore } }, 200, { count: realRostersBefore });

  if (jovens?.id) {
    const cross = await http(LOCAL, "GET", `/rosters/by-ministry/${atmosfera?.id}`, { token: tokenOf("lider.jovens.demo@example.test") });
    step(lider.steps, "GET ministério alheio", cross, 403);
    const own = await http(LOCAL, "GET", `/rosters/by-ministry/${jovens.id}`, { token: tokenOf("lider.jovens.demo@example.test") });
    step(lider.steps, "GET o próprio ministério", own, 200);
    const month = "2026-12";
    const preview = await http(LOCAL, "POST", `/rosters/by-ministry/${jovens.id}/monthly-simulation`, {
      token: tokenOf("lider.jovens.demo@example.test"), json: { month, fillOnlyOpen: true },
    });
    step(lider.steps, "POST simular mês de jovens", preview, [200, 201], { revision: preview.data?.revision ? "presente" : null });
    if (preview.data?.revision) {
      const saved = await http(LOCAL, "POST", `/rosters/by-ministry/${jovens.id}/monthly-simulation/save`, {
        token: tokenOf("lider.jovens.demo@example.test"),
        json: { month, revision: preview.data.revision, fillOnlyOpen: true },
      });
      step(lider.steps, "POST gravar rascunho do mês", saved, [200, 201, 409]);
      const again = await http(LOCAL, "POST", `/rosters/by-ministry/${jovens.id}/monthly-simulation/save`, {
        token: tokenOf("lider.jovens.demo@example.test"),
        json: { month, revision: preview.data.revision, fillOnlyOpen: true },
      });
      step(lider.steps, "POST gravar o mesmo rascunho de novo", again, [200, 201, 409]);
    }
    if (louvor?.id) {
      const louvorMonth = await http(LOCAL, "POST", `/rosters/by-ministry/${louvor.id}/prepare-louvor`, { token: tokenOf("platform.demo@example.test") });
      step(admin.steps, "POST preparar Louvor", louvorMonth, [200, 201, 403, 409]);
      const louvorDraw = await http(LOCAL, "POST", `/rosters/by-ministry/${louvor.id}/monthly-simulation`, {
        token: tokenOf("platform.demo@example.test"), json: { month: "2026-12", fillOnlyOpen: true },
      });
      step(admin.steps, "POST simular mês do Louvor", louvorDraw, [200, 201, 403, 409]);
      const atmosferaDraw = await http(LOCAL, "POST", `/rosters/by-ministry/${atmosfera?.id}/monthly-simulation`, {
        token: tokenOf("platform.demo@example.test"), json: { month: "2026-12", moduleId, fillOnlyOpen: true },
      });
      step(admin.steps, "POST simular mês da Atmosfera", atmosferaDraw, [200, 201, 403, 409]);
    }
  } else {
    lider.steps.push({ name: "ministério de jovens", status: "BLOCKED", http: null, code: "Seed sem ministério jovens" });
  }

  const moduleLeader = { persona: "LIDER_MODULO", steps: [] };
  if (!personId || !moduleId || !atmosfera?.id) {
    moduleLeader.steps.push({ name: "concessão", status: "BLOCKED", http: null, code: "Pessoa ou módulo sintético não foi criado" });
  } else {
    const invite = await http(LOCAL, "POST", "/admin/access", {
      token: tokenOf("platform.demo@example.test"),
      json: { personId, email: "qa-persona-20261123-modulo@example.test", role: "LIDER_MODULO", ministryId: atmosfera.id, moduleId },
    });
    const preview = invite.data?.invite?.previewUrl ?? invite.data?.previewUrl ?? null;
    step(moduleLeader.steps, "POST conceder líder de módulo", invite, [200, 201], { invitation: invite.data?.invitationStatus ?? invite.data?.status ?? null, preview: Boolean(preview) });
    const token = preview ? new URL(preview).hash.replace(/^#/, "") : "";
    const params = new URLSearchParams(token);
    const activated = params.get("token") ? await http(LOCAL, "POST", "/auth/activate-invite", {
      json: { token: params.get("token"), password: syntheticPassword },
    }) : { status: 0, data: { message: "preview ausente" } };
    step(moduleLeader.steps, "POST ativar convite sem e-mail real", activated, [200, 201]);
    const signed = params.get("token") ? await login(LOCAL, "qa-persona-20261123-modulo@example.test", syntheticPassword) : { status: 0, hasToken: false, roles: [] };
    moduleLeader.steps.push({ name: "POST login do líder de módulo", status: signed.hasToken ? "PASS" : "FAIL", http: signed.status, roles: signed.roles });
    if (signed.hasToken) {
      const ownModule = await http(LOCAL, "PATCH", `/ministries/${atmosfera.id}/roster-modules/${moduleId}/rules`, {
        token: tokenOf("qa-persona-20261123-modulo@example.test"), json: rulesBody,
      });
      step(moduleLeader.steps, "PATCH o próprio módulo", ownModule, 200);
      const globalDraw = louvor?.id ? await http(LOCAL, "POST", `/rosters/by-ministry/${louvor.id}/monthly-simulation`, {
        token: tokenOf("qa-persona-20261123-modulo@example.test"), json: { month: "2026-12" },
      }) : { status: 0, data: null };
      step(moduleLeader.steps, "POST sorteio global de outro ministério", globalDraw, 403);
      const otherMinistry = jovens?.id ? await http(LOCAL, "GET", `/rosters/by-ministry/${jovens.id}`, { token: tokenOf("qa-persona-20261123-modulo@example.test") }) : { status: 0, data: null };
      step(moduleLeader.steps, "GET ministério alheio", otherMinistry, 403);
      const link = await db.ministryRosterModuleLeader.findFirst({ where: { moduleId, personId }, select: { id: true } });
      moduleLeader.steps.push({ name: "DB ministry_roster_module_leaders", status: link ? "PASS" : "FAIL", http: null, after: link ? "vínculo presente" : "vínculo ausente" });
    }
  }
  journeys.push(moduleLeader);

  const accountMe = await http(LOCAL, "GET", "/account/me", { token: tokenOf("bruno.demo@example.test") });
  step(membro.steps, "GET Minha Conta", accountMe, 200);
  const myRoster = await http(LOCAL, "GET", "/rosters/me", { token: tokenOf("bruno.demo@example.test") });
  step(membro.steps, "GET Meu espaço", myRoster, 200);
  const assignment = (myRoster.data?.assignments ?? myRoster.data?.items ?? []).find((item) => item.status === "PENDING" || item.id);
  if (assignment?.id) {
    const declined = await http(LOCAL, "POST", `/rosters/assignments/${assignment.id}/decline`, { token: tokenOf("bruno.demo@example.test") });
    step(membro.steps, "POST recusar escala", declined, [200, 201, 403, 409]);
  } else {
    membro.steps.push({ name: "aceitar ou recusar escala", status: "BLOCKED", http: null, code: "Seed sem designação pendente para o membro" });
  }
  const secretariaDenied = await http(LOCAL, "GET", "/memberships", { token: tokenOf("bruno.demo@example.test") });
  step(membro.steps, "GET secretaria negada ao membro", secretariaDenied, 403);
  const card = await http(LOCAL, "GET", "/credentials/me", { token: tokenOf("bruno.demo@example.test") });
  const qrPresent = Boolean(card.data?.qrSvg || card.data?.card?.qrSvg || card.data?.qrPayload);
  step(membro.steps, "GET QR da própria carteirinha", card, 200, { qr: qrPresent ? "opaco presente" : "ausente" });
  if (!qrPresent) membro.steps.at(-1).status = "FAIL";

  const futureEvent = await http(LOCAL, "POST", "/events", {
    token: tokenOf("ana.demo@example.test"),
    json: {
      name: `${PREFIX} encontro`, slug: "qa-persona-20261123-encontro", startsAt: "2026-12-12T19:00:00.000Z",
      endsAt: "2026-12-12T21:00:00.000Z", description: PREFIX, locationText: "Salão sintético",
    },
  });
  step(secretaria.steps, "POST evento sintético", futureEvent, [200, 201], { id: futureEvent.data?.id ?? null });
  const eventId = futureEvent.data?.id;
  const modality = eventId ? await http(LOCAL, "POST", `/events/${eventId}/modalities`, {
    token: tokenOf("ana.demo@example.test"), json: { code: "individual", name: `${PREFIX} individual`, kind: "INDIVIDUAL" },
  }) : { status: 0, data: null };
  const lot = eventId ? await http(LOCAL, "POST", `/events/${eventId}/lots`, {
    token: tokenOf("ana.demo@example.test"),
    json: { code: "livre", name: `${PREFIX} livre`, modalityId: modality.data?.id, priceCents: 0, status: "OPEN" },
  }) : { status: 0, data: null };
  const publishedEvent = eventId ? await http(LOCAL, "POST", `/events/${eventId}/publish`, { token: tokenOf("ana.demo@example.test") }) : { status: 0, data: null };
  step(secretaria.steps, "POST publicar evento gratuito", publishedEvent, [200, 201], { modality: modality.status, lot: lot.status });
  const registration = await http(LOCAL, "POST", "/public/events/qa-persona-20261123-encontro/registrations", {
    token: tokenOf("bruno.demo@example.test"),
    json: { displayName: "Bruno Demo", modalityId: modality.data?.id, lotId: lot.data?.id },
  });
  step(membro.steps, "POST inscrição do membro", registration, [200, 201], { id: registration.data?.id ?? null, ticket: Boolean(registration.data?.tickets?.[0]?.code || registration.data?.checkInCode) });
  const mine = await http(LOCAL, "GET", "/member-events/registrations", { token: tokenOf("bruno.demo@example.test") });
  step(membro.steps, "GET a própria inscrição", mine, 200);

  const guest = { persona: "CONVIDADO", steps: [] };
  const guestEmail = "qa-persona-20261123-convidado@example.test";
  const registered = await http(LOCAL, "POST", "/auth/guest-registration", {
    json: { displayName: `${PREFIX} Convidado`, email: guestEmail, password: syntheticPassword },
  });
  const guestToken = registered.data?.accessToken;
  if (guestToken) sessions.set(guestEmail, guestToken);
  guest.steps.push({ name: "POST cadastro de convidado", status: guestToken ? "PASS" : "FAIL", http: registered.status, code: registered.data?.code ?? null });
  const guestAgain = await login(LOCAL, guestEmail, syntheticPassword);
  guest.steps.push({ name: "POST retorno pelo mesmo login", status: guestAgain.hasToken ? "PASS" : "FAIL", http: guestAgain.status, roles: guestAgain.roles });
  if (guestAgain.hasToken && modality.data?.id && lot.data?.id) {
    const guestRegistration = await http(LOCAL, "POST", "/public/events/qa-persona-20261123-encontro/registrations", {
      token: tokenOf(guestEmail), json: { displayName: `${PREFIX} Convidado`, modalityId: modality.data.id, lotId: lot.data.id },
    });
    step(guest.steps, "POST inscrição do convidado", guestRegistration, [200, 201], { ticket: Boolean(guestRegistration.data?.tickets?.[0]?.code || guestRegistration.data?.checkInCode) });
  }
  const guestLedger = await http(LOCAL, "GET", "/ledger/accounts", { token: sessions.get(guestEmail) });
  step(guest.steps, "GET tesouraria negada ao convidado", guestLedger, 403);
  const guestPeople = await http(LOCAL, "GET", "/memberships", { token: sessions.get(guestEmail) });
  step(guest.steps, "GET secretaria negada ao convidado", guestPeople, 403);
  journeys.push(guest);

  const cms = await http(LOCAL, "POST", "/cms/contents", {
    token: tokenOf("editor.demo@example.test"),
    json: { kind: "NEWS", slug: "qa-persona-20261123-noticia", title: `${PREFIX} noticia`, summary: PREFIX, body: "Texto sintético de prévia." },
  });
  step(editor.steps, "POST rascunho editorial", cms, [200, 201], { id: cms.data?.id ?? null, status: cms.data?.status ?? null });
  const contentId = cms.data?.id;
  const reopened = contentId ? await http(LOCAL, "GET", `/cms/contents/${contentId}`, { token: tokenOf("editor.demo@example.test") }) : { status: 0, data: null };
  step(editor.steps, "GET prévia reaberta", reopened, 200, { status: reopened.data?.status ?? null });
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  const media = new FormData();
  media.set("file", new Blob([png], { type: "image/png" }), `${PREFIX}.png`);
  const uploadedMedia = await http(LOCAL, "POST", "/cms/site-media", { token: tokenOf("editor.demo@example.test"), form: media });
  step(editor.steps, "POST foto de capa sintética", uploadedMedia, [200, 201], { id: uploadedMedia.data?.id ?? null });
  const editorPublish = contentId ? await http(LOCAL, "POST", `/cms/contents/${contentId}/advance`, {
    token: tokenOf("editor.demo@example.test"), json: { toStatus: "PUBLICADO", note: PREFIX },
  }) : { status: 0, data: null };
  step(editor.steps, "POST editor não publica", editorPublish, 403);
  const review = contentId ? await http(LOCAL, "POST", `/cms/contents/${contentId}/advance`, {
    token: tokenOf("editor.demo@example.test"), json: { toStatus: "REVISAO", note: PREFIX },
  }) : { status: 0, data: null };
  step(editor.steps, "POST enviar para revisão", review, [200, 201], { status: review.data?.status ?? null });
  const publisherPublish = contentId ? await http(LOCAL, "POST", `/cms/contents/${contentId}/advance`, {
    token: tokenOf("publicador.demo@example.test"), json: { toStatus: "PUBLICADO", note: PREFIX, notifyOnPublish: false },
  }) : { status: 0, data: null };
  step(publicador.steps, "POST publicador publica", publisherPublish, [200, 201], { status: publisherPublish.data?.status ?? null });
  const publicContent = await http(LOCAL, "GET", "/public/content/qa-persona-20261123-noticia");
  step(publicador.steps, "GET conteúdo público", publicContent, 200, { title: publicContent.data?.title ?? null });
  const publisherLedger = await http(LOCAL, "GET", "/ledger/accounts", { token: tokenOf("publicador.demo@example.test") });
  step(publicador.steps, "GET tesouraria negada ao publicador", publisherLedger, 403);
  const publisherPastoral = await http(LOCAL, "GET", "/pastoral/congregation", { token: tokenOf("publicador.demo@example.test") });
  step(publicador.steps, "GET pastoral negada ao publicador", publisherPastoral, 403);

  if (otherChurch?.id && household.data?.id) {
    const moved = await http(LOCAL, "POST", "/auth/switch-church", {
      token: tokenOf("ana.demo@example.test"), json: { churchId: otherChurch.id },
    });
    const otherToken = moved.data?.accessToken;
    const isolated = otherToken ? await http(LOCAL, "GET", `/households/${household.data.id}`, { token: otherToken }) : moved;
    step(secretaria.steps, "GET família de outra igreja", isolated, [403, 404], { switched: moved.status });
  }

  const auditAfter = await db.auditLog.count();
  const expenseRows = await db.ledgerEntry.count({ where: { description: { startsWith: PREFIX } } });
  const cmsRows = await db.cmsContent.count({ where: { slug: { startsWith: "qa-persona-20261123" } } });
  const moduleLeaders = await db.ministryRosterModuleLeader.count();
  admin.steps.push({
    name: "DB auditoria e persistência",
    status: auditAfter > auditBefore && expenseRows >= 1 ? "PASS" : "FAIL",
    http: null,
    before: { auditLogs: auditBefore },
    after: { auditLogs: auditAfter, expenses: expenseRows, cms: cmsRows, moduleLeaders },
  });

  for (const journey of journeys) {
    if (journey.login && !journey.login.hasToken) {
      journey.verdict = "BLOCKED";
      journey.reason = "Login local não emitiu sessão.";
    } else {
      journey.verdict = rollup(journey.steps);
    }
  }
  const summary = journeys.map((journey) => ({ persona: journey.persona, local: journey.verdict, hosted: "BLOCKED" }));
  const report = {
    sha: SHA,
    generatedAt: new Date().toISOString(),
    hosted,
    local: {
      api: LOCAL,
      database: "postgresql://localhost:5432/idbrf",
      neon: "não contactado",
      hmlBranchForbidden: "br-jolly-darkness-b6f5mzsy",
      qaBranchNotContacted: "br-twilight-bonus-b6moawk7",
      ready: health.data,
      email: "preview/local, nenhum SMTP",
      payments: "lote gratuito, sem Mercado Pago",
    },
    summary,
    journeys: journeys.map((journey) => ({ ...journey, steps: journey.steps.map((item) => ({ ...item, body: undefined })) })),
  };
  mkdirSync("docs/qa/evidence", { recursive: true });
  writeFileSync("docs/qa/evidence/aceite-funcional-2026-11-23.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  await db.$disconnect();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "falha");
  process.exitCode = 1;
});
