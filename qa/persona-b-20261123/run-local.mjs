/**
 * Rodada funcional LOCAL das personas B (issue #311).
 * Só grava em Postgres de localhost. Recusa Neon, HML e produção.
 * Não imprime senha, token nem URL de banco.
 */
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const PREFIX = "QA-PERSONA-B-20261123";
const MONTH = "2027-03";
const API = process.env.QA_LOCAL_API ?? "http://127.0.0.1:3011";

function assertLocalDatabase() {
  const raw = process.env.DATABASE_URL ?? "";
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("BLOQUEADO: DATABASE_URL ausente ou inválida");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
    throw new Error("BLOQUEADO: este roteiro só grava em Postgres local");
  }
  if (/neon\.tech|vercel|br-jolly-darkness|br-twilight-bonus|amazonaws|hostinger/i.test(raw)) {
    throw new Error("BLOQUEADO: identificador de Neon, HML ou nuvem na URL");
  }
  if (process.env.IDBRF_RUNTIME_STAGE === "production" || process.env.IDBRF_RUNTIME_STAGE === "hml") {
    throw new Error("BLOQUEADO: estágio HML ou produção");
  }
  return url.pathname.replace(/^\//, "").split("?")[0];
}

function redact(value) {
  if (Array.isArray(value)) return value.slice(0, 8).map(redact);
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (/token|password|authorization|secret|cookie/i.test(key)) {
      out[key] = "[omitido]";
      continue;
    }
    out[key] = redact(item);
  }
  return out;
}

async function http(method, path, { token, body, form } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const response = await fetch(`${API}${path}`, { method, headers, body: payload });
  const type = response.headers.get("content-type") ?? "";
  let parsed = null;
  const buffer = Buffer.from(await response.arrayBuffer());
  if (type.includes("json")) {
    try {
      parsed = JSON.parse(buffer.toString("utf8"));
    } catch {
      parsed = { parse: "invalid-json" };
    }
  } else if (type.includes("pdf") || path.includes("format=pdf")) {
    parsed = { bytes: buffer.length, pdf: buffer.subarray(0, 4).toString() === "%PDF" };
  } else if (type.includes("spreadsheet") || type.includes("excel") || path.includes("format=xls")) {
    const text = buffer.toString("utf8");
    parsed = {
      bytes: buffer.length,
      spreadsheetMl: text.includes("urn:schemas-microsoft-com:office:spreadsheet"),
      includesFixture: text.includes("QA-PERSONA-B-20261123"),
    };
  } else {
    parsed = { bytes: buffer.length, contentType: type };
  }
  return { status: response.status, body: parsed };
}

const cases = [];
function record(entry) {
  cases.push(entry);
  const line = `${entry.verdict} ${entry.persona} ${entry.action} HTTP ${entry.http ?? "-"}`;
  console.error(line);
}

async function login(email) {
  const password = process.env.QA_DEMO_PASSWORD;
  if (!password) throw new Error("QA_DEMO_PASSWORD ausente no ambiente local");
  const result = await http("POST", "/auth/login", { body: { email, password } });
  const token = result.body?.accessToken;
  return { status: result.status, token: typeof token === "string" ? token : null, mfa: result.body?.mfa ?? result.body?.code ?? null };
}

async function main() {
  const databaseName = assertLocalDatabase();
  const prisma = new PrismaClient();
  await prisma.$connect();
  const dbName = await prisma.$queryRaw`SELECT current_database() AS name`;
  if (dbName[0]?.name !== databaseName) throw new Error("BLOQUEADO: current_database divergente");

  const before = await snapshot(prisma);
  const fixtures = await ensureRosterFixtures(prisma);
  const afterFixtures = await snapshot(prisma);

  const treasurer = await login("tesouraria.demo@example.test");
  const reviewer = await login("tesouraria2.demo@example.test");
  const pastor = await login("pastor.demo@example.test");
  const member = await login("bruno.demo@example.test");
  const jovens = await login("lider.jovens.demo@example.test");
  const louvor = await login(fixtures.louvorEmail);
  const atmosfera = await login(fixtures.atmosferaEmail);
  const moduleLeader = await login(fixtures.moduleEmail);
  const invitee = await login(fixtures.inviteeEmail);

  record({
    persona: "AUTH",
    action: "login local das contas sintéticas sem MFA bloqueante",
    before: { users: before.users },
    after: { logins: { treasurer: treasurer.status, pastor: pastor.status, louvor: louvor.status, module: moduleLeader.status } },
    http: treasurer.status,
    verdict: [treasurer, pastor, louvor, moduleLeader, member].every((item) => item.token) ? "PASS" : "FAIL",
    note: "LOCAL. F11_MFA_BLOCKING desligado só neste processo. Não é sessão hospedada.",
  });

  if (!treasurer.token || !pastor.token) {
    throw new Error("Login local da tesouraria ou do pastor não emitiu sessão");
  }

  const accounts = await http("GET", "/ledger/accounts", { token: treasurer.token });
  const expenseAccount = accounts.body?.accounts?.find((item) => item.code === "5.1.01");
  const bankAccount = accounts.body?.accounts?.find((item) => item.code === "1.1.02");
  const balancesBefore = await http("GET", "/ledger/balances", { token: treasurer.token });
  const centersBefore = await http("GET", "/ledger/cost-centers", { token: treasurer.token });

  const center = await http("POST", "/ledger/cost-centers", {
    token: treasurer.token,
    body: { code: "QAPB-20261123", name: `${PREFIX} centro de custo` },
  });
  const expense = await http("POST", "/ledger/expenses", {
    token: treasurer.token,
    body: {
      requestId: randomUUID(),
      entryDate: "2026-11-20",
      description: `${PREFIX} despesa sintetica de papel`,
      expenseAccountId: expenseAccount?.id,
      cashAccountId: bankAccount?.id,
      amountCents: 4500,
      costCenterId: center.body?.id,
    },
  });
  const expenseId = expense.body?.id;
  const expenseRowBeforeApprove = expenseId
    ? await prisma.ledgerEntry.findUnique({
      where: { id: expenseId },
      select: { status: true, createdByUserId: true, firstApprovedByUserId: true, secondApprovedByUserId: true, amountCents: true },
    })
    : null;
  const selfApprove = expenseId
    ? await http("POST", `/ledger/entries/${expenseId}/approve`, { token: treasurer.token })
    : { status: 0, body: null };
  const otherTreasurer = expenseId
    ? await http("POST", `/ledger/entries/${expenseId}/approve`, { token: reviewer.token })
    : { status: 0, body: null };
  const pastorApprove = expenseId
    ? await http("POST", `/ledger/entries/${expenseId}/approve`, { token: pastor.token })
    : { status: 0, body: null };
  const expenseRowAfter = expenseId
    ? await prisma.ledgerEntry.findUnique({
      where: { id: expenseId },
      select: { status: true, firstApprovedByUserId: true, secondApprovedByUserId: true, costCenterId: true },
    })
    : null;
  const balancesAfterApproval = await http("GET", "/ledger/balances", { token: treasurer.token });
  const bankBefore = bankCents(balancesBefore.body, "1.1.02") ?? 0;
  const bankAfter = bankCents(balancesAfterApproval.body, "1.1.02");

  const treasuryPass = expense.status >= 200 && expense.status < 300 && Boolean(center.body?.id);
  const separationPass = (selfApprove.status === 403 || selfApprove.status === 409)
    && otherTreasurer.status === 403
    && pastorApprove.status >= 200 && pastorApprove.status < 300
    && expenseRowAfter?.status === "APPROVED"
    && expenseRowAfter.secondApprovedByUserId
    && expenseRowAfter.secondApprovedByUserId !== expenseRowBeforeApprove?.createdByUserId
    && expenseRowAfter.costCenterId === center.body?.id
    && bankAfter === bankBefore - 4500;
  record({
    persona: "TESOURARIA",
    action: "criar despesa sintética; criador não aprova; outro tesoureiro não fecha; pastor aprova em separado",
    before: { balances: summarizeBalances(balancesBefore.body), centers: centersBefore.body?.costCenters?.length ?? centersBefore.body?.length ?? null, entry: null },
    after: {
      created: { status: expense.status, entryStatus: expenseRowBeforeApprove?.status ?? null, amountCents: expenseRowBeforeApprove?.amountCents ?? null },
      selfApprove: { status: selfApprove.status, code: selfApprove.body?.code ?? null },
      otherTreasurer: { status: otherTreasurer.status, code: otherTreasurer.body?.code ?? otherTreasurer.body?.message ?? null },
      pastor: { status: pastorApprove.status, db: expenseRowAfter },
      center: { status: center.status, id: center.body?.id ?? null },
      bankCents: { before: bankBefore, after: bankAfter },
    },
    http: pastorApprove.status,
    verdict: treasuryPass && separationPass ? "PASS" : "FAIL",
    note: "LOCAL. Nenhuma chamada a banco live.",
  });

  const ofx = [
    "<OFX>",
    "<CURDEF>BRL",
    "<STMTRS>",
    "<STMTTRN>",
    "<DTPOSTED>20261120",
    "<TRNAMT>-45.00",
    `<FITID>${PREFIX}-OFX-1`,
    `<NAME>${PREFIX} extrato sintetico`,
    "</STMTTRN>",
    "</STMTRS>",
    "</OFX>",
  ].join("");
  const importsBefore = await prisma.bankImportBatch.count();
  const imported = await http("POST", "/ledger/imports", {
    token: treasurer.token,
    body: { format: "OFX", filename: `${PREFIX}.ofx`, textContent: ofx, adapter: "FILE" },
  });
  const form = new FormData();
  form.set("accountId", bankAccount?.id ?? "");
  form.set("file", new Blob([ofx], { type: "application/octet-stream" }), `${PREFIX}.ofx`);
  const uploaded = await http("POST", "/ledger/imports/ofx", { token: treasurer.token, form });
  const line = await prisma.bankStatementLine.findFirst({
    where: { externalRef: `${PREFIX}-OFX-1` },
    select: { id: true, matchStatus: true, amountCents: true },
  });
  const reconBefore = await prisma.reconciliation.count();
  const recon = await http("POST", "/ledger/reconciliations", {
    token: treasurer.token,
    body: {
      title: `${PREFIX} conciliacao`,
      periodStart: "2026-11-01",
      periodEnd: "2026-11-30",
      notes: "OFX sintetico, sem rede bancaria",
    },
  });
  const matched = line && expenseId
    ? await http("POST", `/ledger/bank-lines/${line.id}/match`, {
      token: treasurer.token,
      body: { entryId: expenseId, reconciliationId: recon.body?.id },
    })
    : { status: 0, body: null };
  const lineAfter = line
    ? await prisma.bankStatementLine.findUnique({ where: { id: line.id }, select: { matchStatus: true, matchedEntryId: true } })
    : null;
  const balancesAfter = await http("GET", "/ledger/balances", { token: treasurer.token });
  const pdf = await http("GET", "/ledger/statements/export?format=pdf", { token: treasurer.token });
  const xls = await http("GET", "/ledger/statements/export?format=xls", { token: treasurer.token });
  const importsAfter = await prisma.bankImportBatch.count();
  record({
    persona: "TESOURARIA",
    action: "importar OFX sintético, conciliar, ler saldos e exportar PDF/Excel",
    before: { imports: importsBefore, reconciliations: reconBefore, line: null },
    after: {
      jsonImport: { status: imported.status, parsed: imported.body?.status ?? imported.body?.code ?? null },
      upload: { status: uploaded.status, code: uploaded.body?.code ?? uploaded.body?.status ?? null },
      reconciliation: { status: recon.status, id: recon.body?.id ?? null },
      match: { status: matched.status, db: lineAfter },
      balances: summarizeBalances(balancesAfter.body),
      pdf: pdf.body,
      xls: xls.body,
      imports: importsAfter,
    },
    http: uploaded.status,
    verdict: imported.status < 300 && uploaded.status < 300 && recon.status < 300 && matched.status < 300
      && lineAfter?.matchStatus === "MATCHED" && pdf.body?.pdf === true
      && xls.body?.spreadsheetMl === true && xls.body?.includesFixture === true
      ? "PASS" : "FAIL",
    note: "LOCAL. Arquivo OFX gerado na memória. Nenhum adaptador bancário live.",
  });

  const memberLedger = await http("GET", "/ledger/accounts", { token: member.token });
  const leaderLedger = await http("GET", "/ledger/balances", { token: moduleLeader.token });
  record({
    persona: "TESOURARIA",
    action: "negar tesouraria a membro e a líder de módulo sem grant financeiro",
    before: { memberRole: "MEMBRO", moduleLeaders: before.moduleLeaders },
    after: { member: memberLedger.status, moduleLeader: leaderLedger.status, moduleCode: leaderLedger.body?.code ?? null },
    http: memberLedger.status,
    verdict: memberLedger.status === 403 && leaderLedger.status === 403 ? "PASS" : "FAIL",
    note: "LOCAL. 403 de API, não só menu oculto.",
  });

  const louvorSim = await http("POST", `/rosters/by-ministry/${fixtures.louvorMinistryId}/monthly-simulation`, {
    token: louvor.token,
    body: { month: MONTH },
  });
  const louvorCross = await http("POST", `/rosters/by-ministry/${fixtures.atmosferaMinistryId}/monthly-simulation`, {
    token: louvor.token,
    body: { month: MONTH },
  });
  const jovensCross = await http("POST", `/rosters/by-ministry/${fixtures.louvorMinistryId}/monthly-simulation`, {
    token: jovens.token,
    body: { month: MONTH },
  });
  const draftsBefore = await prisma.roster.count({ where: { ministryId: fixtures.louvorMinistryId, status: "DRAFT" } });
  const louvorSave = louvorSim.status < 300
    ? await http("POST", `/rosters/by-ministry/${fixtures.louvorMinistryId}/month/${MONTH}`, {
      token: louvor.token,
      body: { fingerprint: louvorSim.body?.revision, pins: [] },
    })
    : { status: 0, body: louvorSim.body };
  const draftsAfter = await prisma.roster.count({ where: { ministryId: fixtures.louvorMinistryId, status: "DRAFT" } });
  const publishedBefore = await prisma.roster.count({ where: { ministryId: fixtures.louvorMinistryId, status: "PUBLISHED" } });
  const louvorPublish = louvorSave.status < 300
    ? await http("POST", `/rosters/by-ministry/${fixtures.louvorMinistryId}/month/${MONTH}/publish`, { token: louvor.token })
    : { status: 0, body: null };
  const publishedAfter = await prisma.roster.count({ where: { ministryId: fixtures.louvorMinistryId, status: "PUBLISHED" } });
  record({
    persona: "LIDER_MINISTERIO",
    action: `sortear ${MONTH} do Louvor, gravar rascunho, publicar e negar ministério alheio`,
    before: { drafts: draftsBefore, published: publishedBefore, moduleLeaders: before.moduleLeaders },
    after: {
      simulation: { status: louvorSim.status, rosters: louvorSim.body?.rosters?.length ?? null, code: louvorSim.body?.code ?? null },
      crossAtmosfera: { status: louvorCross.status, code: louvorCross.body?.code ?? null },
      jovensNoLouvor: { status: jovensCross.status, code: jovensCross.body?.code ?? null },
      save: { status: louvorSave.status, savedRosters: louvorSave.body?.savedRosters ?? null, code: louvorSave.body?.code ?? null },
      drafts: draftsAfter,
      publish: { status: louvorPublish.status, publishedRosters: louvorPublish.body?.publishedRosters ?? null },
      published: publishedAfter,
    },
    http: louvorSim.status,
    verdict: louvorSim.status < 300 && (louvorSim.body?.rosters?.length ?? 0) >= 12
      && louvorCross.status === 403 && jovensCross.status === 403
      && louvorSave.status < 300 && draftsAfter >= 12
      && louvorPublish.status < 300 && publishedAfter >= 12
      ? "PASS" : "FAIL",
    note: "LOCAL. Cultos sintéticos de 2027-03. Sem WhatsApp.",
  });

  const atmSim = await http("POST", `/rosters/by-ministry/${fixtures.atmosferaMinistryId}/monthly-simulation`, {
    token: atmosfera.token,
    body: { month: MONTH },
  });
  const atmSave = atmSim.status < 300
    ? await http("POST", `/rosters/by-ministry/${fixtures.atmosferaMinistryId}/month/${MONTH}`, {
      token: atmosfera.token,
      body: { fingerprint: atmSim.body?.revision, pins: [] },
    })
    : { status: 0, body: atmSim.body };
  const atmPublish = atmSave.status < 300
    ? await http("POST", `/rosters/by-ministry/${fixtures.atmosferaMinistryId}/month/${MONTH}/publish`, { token: atmosfera.token })
    : { status: 0, body: null };
  const atmDrafts = await prisma.roster.count({ where: { ministryId: fixtures.atmosferaMinistryId, status: "PUBLISHED" } });
  const membership = await prisma.ministryMembership.findFirst({
    where: { id: fixtures.editableMembershipId },
    select: { id: true, personId: true },
  });
  const modulesBefore = await prisma.ministryRosterModuleMembership.count({
    where: { membershipId: fixtures.editableMembershipId, status: "ATIVO" },
  });
  const edited = await http("PATCH", `/ministries/${fixtures.atmosferaMinistryId}/memberships/${fixtures.editableMembershipId}/roster-modules`, {
    token: atmosfera.token,
    body: { addModuleIds: [fixtures.otherModuleId], removeModuleIds: [] },
  });
  const modulesAfter = await prisma.ministryRosterModuleMembership.count({
    where: { membershipId: fixtures.editableMembershipId, status: "ATIVO", moduleId: fixtures.otherModuleId },
  });
  record({
    persona: "LIDER_MINISTERIO",
    action: `sortear ${MONTH} da Atmosfera, publicar rascunho e editar módulo do integrante`,
    before: { published: 0, moduleLinks: modulesBefore, membership: membership?.id ?? null },
    after: {
      simulation: { status: atmSim.status, rosters: atmSim.body?.rosters?.length ?? null, code: atmSim.body?.code ?? null },
      save: { status: atmSave.status, code: atmSave.body?.code ?? null },
      publish: { status: atmPublish.status, dbPublished: atmDrafts },
      edit: { status: edited.status, code: edited.body?.code ?? null, activeOnTarget: modulesAfter },
    },
    http: atmSim.status,
    verdict: atmSim.status < 300 && (atmSim.body?.rosters?.length ?? 0) >= 12
      && atmSave.status < 300 && atmPublish.status < 300 && atmDrafts >= 12
      && edited.status < 300 && modulesAfter >= 1
      ? "PASS" : "FAIL",
    note: "LOCAL. Integrantes sintéticos com prefixo da frente.",
  });

  const leadersBefore = before.moduleLeaders;
  const modWhole = await http("POST", `/rosters/by-ministry/${fixtures.atmosferaMinistryId}/monthly-simulation`, {
    token: moduleLeader.token,
    body: { month: MONTH },
  });
  const modOwn = await http("GET", `/rosters/by-ministry/${fixtures.atmosferaMinistryId}`, { token: moduleLeader.token });
  const modOther = await http("POST", `/rosters/by-ministry/${fixtures.atmosferaMinistryId}/monthly-simulation`, {
    token: moduleLeader.token,
    body: { month: MONTH, moduleId: fixtures.otherModuleId },
  });
  const modPublish = await http("POST", `/rosters/by-ministry/${fixtures.atmosferaMinistryId}/month/${MONTH}/publish`, {
    token: moduleLeader.token,
  });
  const ownModuleIds = (modOwn.body?.modules ?? []).map((item) => item.id);
  record({
    persona: "LIDER_MODULO",
    action: "ver só o módulo concedido, recusar sorteio global, publicação do mês e módulo alheio",
    before: { ministry_roster_module_leaders: leadersBefore },
    after: {
      leaders: afterFixtures.moduleLeaders,
      wholeMonth: { status: modWhole.status, code: modWhole.body?.code ?? null },
      own: { status: modOwn.status, scope: modOwn.body?.permissions?.scope ?? null, modules: ownModuleIds },
      otherModule: { status: modOther.status, code: modOther.body?.code ?? null },
      publishMonth: { status: modPublish.status, code: modPublish.body?.code ?? null },
      grantCreatedBy: "fixture local prisma; não existe endpoint de concessão no produto",
    },
    http: modOwn.status,
    verdict: leadersBefore === 0 && afterFixtures.moduleLeaders >= 1
      && modWhole.status === 403 && modPublish.status === 403 && modOther.status === 403
      && modOwn.status === 200 && modOwn.body?.permissions?.scope === "modules"
      && ownModuleIds.length === 1 && ownModuleIds[0] === fixtures.ownModuleId
      ? "PASS" : "FAIL",
    note: "LOCAL. Concessão sintética inserida no Postgres descartável porque o catálogo de papéis não tem LIDER_MODULO e a API não oferece grant. Neon QA não foi alterado; lá o caso hospedado continua BLOCKED.",
  });

  const invitesBefore = await prisma.ministryRosterMemberInvitation.count();
  const responsesBefore = await prisma.rosterAssignmentResponse.count();
  const invitation = await http("POST", `/ministries/${fixtures.atmosferaMinistryId}/roster-member-invitations`, {
    token: moduleLeader.token,
    body: { personId: fixtures.inviteePersonId, moduleId: fixtures.ownModuleId },
  });
  const invitationId = invitation.body?.id ?? invitation.body?.invitation?.id;
  const accept = invitationId
    ? await http("POST", `/rosters/membership-invitations/${invitationId}/accept`, { token: invitee.token })
    : { status: 0, body: invitation.body };
  const foreignInvite = await http("POST", `/ministries/${fixtures.atmosferaMinistryId}/roster-member-invitations`, {
    token: moduleLeader.token,
    body: { personId: fixtures.inviteePersonId, moduleId: fixtures.otherModuleId },
  });
  const declineTarget = await prisma.rosterAssignment.findFirst({
    where: { status: "PENDING", slot: { roster: { ministryId: fixtures.louvorMinistryId } } },
    select: { id: true, personId: true },
  });
  let decline = { status: 0, body: { code: "NO_ASSIGNMENT" } };
  if (declineTarget) {
    const volunteer = await prisma.user.findFirst({ where: { personId: declineTarget.personId }, select: { email: true } });
    const session = volunteer ? await login(volunteer.email) : { token: null };
    if (session.token) {
      decline = await http("POST", `/assignments/${declineTarget.id}/decline`, { token: session.token });
    }
  }
  const invitesAfter = await prisma.ministryRosterMemberInvitation.count();
  const declined = declineTarget
    ? await prisma.rosterAssignment.findUnique({ where: { id: declineTarget.id }, select: { status: true } })
    : null;
  record({
    persona: "LIDER_MODULO",
    action: "convidar para o próprio módulo, aceitar, recusar módulo alheio e registrar recusa de escala",
    before: { invitations: invitesBefore, responses: responsesBefore },
    after: {
      invite: { status: invitation.status, code: invitation.body?.code ?? null },
      accept: { status: accept.status, code: accept.body?.code ?? null },
      foreign: { status: foreignInvite.status, code: foreignInvite.body?.code ?? null },
      decline: { status: decline.status, code: decline.body?.code ?? null, db: declined },
      invitations: invitesAfter,
    },
    http: invitation.status,
    verdict: invitation.status < 300 && accept.status < 300 && foreignInvite.status === 403
      && decline.status < 300 && declined?.status === "DECLINED"
      ? "PASS" : "FAIL",
    note: "LOCAL. Convite sintético, sem e-mail e sem WhatsApp.",
  });

  const summary = {
    surface: "LOCAL",
    sha: "5f32bb3fd4006e8f3276721210e4664e5a59b6d3",
    database: databaseName,
    host: "localhost",
    prefix: PREFIX,
    month: MONTH,
    before,
    cases: cases.map((item) => ({ ...item, before: redact(item.before), after: redact(item.after) })),
  };
  const serialized = JSON.stringify(summary, null, 2);
  if (/postgresql:\/\/|password|accessToken|Bearer /i.test(serialized)) {
    throw new Error("Relatório bloqueado porque incluiria segredo");
  }
  console.log(serialized);
  await prisma.$disconnect();
}

function bankCents(body, code) {
  const bank = body?.banks?.find((item) => item.code === code);
  return typeof bank?.balanceCents === "number" ? bank.balanceCents : null;
}

function summarizeBalances(body) {
  if (!body || typeof body !== "object") return null;
  const banks = body.banks ?? body.accounts ?? body.balances ?? null;
  if (Array.isArray(banks)) {
    return banks.slice(0, 6).map((item) => ({
      code: item.code ?? item.accountCode ?? null,
      cents: item.balanceCents ?? item.cents ?? item.amountCents ?? null,
    }));
  }
  return { keys: Object.keys(body).slice(0, 12) };
}

async function snapshot(prisma) {
  const [users, moduleLeaders, expenses, rosters, invitations] = await Promise.all([
    prisma.user.count(),
    prisma.ministryRosterModuleLeader.count(),
    prisma.ledgerEntry.count({ where: { description: { startsWith: PREFIX } } }),
    prisma.roster.count(),
    prisma.ministryRosterMemberInvitation.count(),
  ]);
  return { users, moduleLeaders, expenses, rosters, invitations };
}

async function ensureRosterFixtures(prisma) {
  const church = await prisma.church.findFirst({ where: { slug: "riacho-fundo-1" }, select: { id: true, organizationId: true } });
  if (!church) throw new Error("Igreja piloto local ausente. Rode a seed antes.");
  const hash = await prisma.user.findUnique({ where: { email: "tesouraria.demo@example.test" }, select: { passwordHash: true } });
  if (!hash?.passwordHash) throw new Error("Conta sintética da tesouraria sem senha local");
  const role = await prisma.role.findUniqueOrThrow({ where: { code: "LIDER_MINISTERIO" } });
  const memberRole = await prisma.role.findUniqueOrThrow({ where: { code: "MEMBRO" } });
  const louvorMinistry = await prisma.ministry.findFirst({ where: { churchId: church.id, slug: "louvor-demo" } });
  const atmosfera = await prisma.ministry.findFirst({ where: { churchId: church.id, slug: "atmosfera" } });
  if (!louvorMinistry || !atmosfera) throw new Error("Ministérios Louvor ou Atmosfera ausentes na seed local");

  const louvorLeader = await upsertUser(prisma, {
    id: "qapb_p_louvor", email: "qa-persona-b-20261123-louvor@example.test",
    name: `${PREFIX} Lider Louvor`, church, passwordHash: hash.passwordHash,
  });
  const atmosferaLeader = await upsertUser(prisma, {
    id: "qapb_p_atm", email: "qa-persona-b-20261123-atmosfera@example.test",
    name: `${PREFIX} Lider Atmosfera`, church, passwordHash: hash.passwordHash,
  });
  const moduleLeader = await upsertUser(prisma, {
    id: "qapb_p_mod", email: "qa-persona-b-20261123-modulo@example.test",
    name: `${PREFIX} Lider Modulo`, church, passwordHash: hash.passwordHash,
  });
  const invitee = await upsertUser(prisma, {
    id: "qapb_p_invite", email: "qa-persona-b-20261123-convidado-modulo@example.test",
    name: `${PREFIX} Convidado Modulo`, church, passwordHash: hash.passwordHash,
  });

  await prisma.ministry.update({ where: { id: louvorMinistry.id }, data: { leaderPersonId: louvorLeader.personId } });
  await prisma.ministry.update({ where: { id: atmosfera.id }, data: { leaderPersonId: atmosferaLeader.personId } });
  await grant(prisma, louvorLeader.userId, role.id, church, louvorMinistry.id, "qapb_g_louvor");
  await grant(prisma, atmosferaLeader.userId, role.id, church, atmosfera.id, "qapb_g_atm");
  await grant(prisma, moduleLeader.userId, role.id, church, atmosfera.id, "qapb_g_mod");
  await grant(prisma, invitee.userId, memberRole.id, church, null, "qapb_g_invite");
  await prisma.ministryMembership.upsert({
    where: { id: "qapb_mm_invite" },
    update: { status: "ATIVO", endedAt: null },
    create: {
      id: "qapb_mm_invite",
      organizationId: church.organizationId,
      churchId: church.id,
      ministryId: atmosfera.id,
      personId: invitee.personId,
      role: "APOIO",
      status: "ATIVO",
    },
  });

  const equipe = [{ label: "Equipe de Louvor", count: 7, couple: false }];
  const louvorRules = {
    positions: { thursday_evening: equipe, sunday_morning: equipe, sunday_evening: equipe },
    qualifications: {}, couples: [], minIntervalDays: 7, maxMonthlyAssignments: 4, substituteInviteLimit: 0,
  };
  const existingLouvor = await prisma.ministryRosterModule.findFirst({
    where: { ministryId: louvorMinistry.id, nameKey: "louvor" },
  });
  const louvorModule = existingLouvor
    ? await prisma.ministryRosterModule.update({ where: { id: existingLouvor.id }, data: { rules: louvorRules } })
    : await prisma.ministryRosterModule.create({
      data: { id: "qapb_mod_louvor", ministryId: louvorMinistry.id, name: "Louvor", nameKey: "louvor", rules: louvorRules },
    });
  for (let index = 1; index <= 34; index += 1) {
    const n = String(index).padStart(2, "0");
    const person = await upsertUser(prisma, {
      id: `qapb_p_l${n}`,
      email: `qa-persona-b-20261123-louvor-${n}@example.test`,
      name: `${PREFIX} Louvor ${n}`,
      church,
      passwordHash: hash.passwordHash,
    });
    await grant(prisma, person.userId, memberRole.id, church, null, `qapb_g_l${n}`);
    await linkMember(prisma, church, louvorMinistry.id, louvorModule.id, person.personId, `qapb_mm_l${n}`);
  }

  const recepcao = await prisma.ministryRosterModule.findFirst({
    where: { ministryId: atmosfera.id, nameKey: "recepcao" },
  });
  const conexao = await prisma.ministryRosterModule.findFirst({
    where: { ministryId: atmosfera.id, nameKey: "conexao" },
  });
  if (!recepcao || !conexao) throw new Error("Módulos Recepção ou Conexão ausentes");
  for (let index = 1; index <= 6; index += 1) {
    const n = String(index).padStart(2, "0");
    const person = await upsertUser(prisma, {
      id: `qapb_p_r${n}`,
      email: `qa-persona-b-20261123-recepcao-${n}@example.test`,
      name: `${PREFIX} Recepcao ${n}`,
      church,
      passwordHash: hash.passwordHash,
    });
    await grant(prisma, person.userId, memberRole.id, church, null, `qapb_g_r${n}`);
    await linkMember(prisma, church, atmosfera.id, recepcao.id, person.personId, `qapb_mm_r${n}`);
  }
  await prisma.ministryRosterModuleLeader.upsert({
    where: { id: "qapb_lead_recepcao" },
    update: { personId: moduleLeader.personId, moduleId: recepcao.id },
    create: {
      id: "qapb_lead_recepcao",
      organizationId: church.organizationId,
      churchId: church.id,
      ministryId: atmosfera.id,
      moduleId: recepcao.id,
      personId: moduleLeader.personId,
    },
  });

  return {
    louvorEmail: louvorLeader.email,
    atmosferaEmail: atmosferaLeader.email,
    moduleEmail: moduleLeader.email,
    inviteeEmail: invitee.email,
    inviteePersonId: invitee.personId,
    louvorMinistryId: louvorMinistry.id,
    atmosferaMinistryId: atmosfera.id,
    ownModuleId: recepcao.id,
    otherModuleId: conexao.id,
    editableMembershipId: "qapb_mm_r01",
  };
}

async function upsertUser(prisma, input) {
  await prisma.person.upsert({
    where: { id: input.id },
    update: { displayName: input.name, email: input.email, status: "ACTIVE" },
    create: {
      id: input.id,
      organizationId: input.church.organizationId,
      homeChurchId: input.church.id,
      displayName: input.name,
      email: input.email,
      kind: "MEMBER",
      status: "ACTIVE",
    },
  });
  const user = await prisma.user.upsert({
    where: { email: input.email },
    update: { personId: input.id, passwordHash: input.passwordHash, status: "ACTIVE", mfaRequired: false },
    create: {
      id: input.id.replace("_p_", "_u_"),
      personId: input.id,
      email: input.email,
      passwordHash: input.passwordHash,
      status: "ACTIVE",
      mfaRequired: false,
    },
  });
  return { personId: input.id, userId: user.id, email: input.email };
}

async function grant(prisma, userId, roleId, church, ministryId, id) {
  await prisma.grant.upsert({
    where: { id },
    update: { userId, roleId, ministryId },
    create: {
      id,
      userId,
      roleId,
      organizationId: church.organizationId,
      churchId: church.id,
      ministryId,
    },
  });
}

async function linkMember(prisma, church, ministryId, moduleId, personId, membershipId) {
  await prisma.ministryMembership.upsert({
    where: { id: membershipId },
    update: { status: "ATIVO", endedAt: null },
    create: {
      id: membershipId,
      organizationId: church.organizationId,
      churchId: church.id,
      ministryId,
      personId,
      role: "APOIO",
      status: "ATIVO",
    },
  });
  await prisma.ministryRosterModuleMembership.upsert({
    where: { id: `${membershipId}_link` },
    update: { status: "ATIVO", endedAt: null, moduleId },
    create: {
      id: `${membershipId}_link`,
      organizationId: church.organizationId,
      churchId: church.id,
      ministryId,
      moduleId,
      membershipId,
      personId,
      status: "ATIVO",
    },
  });
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "falha";
  console.error(message);
  process.exit(1);
});
