import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  CI_CONFIRM,
  CI_DATABASE_NAME,
  QA_BRANCH_ID,
  QA_CONFIRM,
  QA_DATABASE_NAME,
  SeedGuardError,
  assertLiveQaIdentity,
  assertQaSeedTarget,
} from "./qa-image-guard.mjs";
import {
  IMAGE_SOURCE_COMMIT,
  PERSONA_VIEWS,
  buildQaImagePlan,
  listQaImageFiles,
  publicEventCards,
  stableOpaqueToken,
} from "./qa-image-catalog.mjs";
import { applyQaImagePlan } from "./qa-image-apply.mjs";
import { assertJpegPortrait, renderQaPortrait } from "./qa-image-portraits.mjs";
import { parseSeedArgs, publicFailure, repoRoot, runSeed } from "./seed-complete-dev.mjs";

const NOW = new Date("2026-11-21T15:00:00.000Z");
const SECRET_URL = "postgresql://qa:super-secret-db-pass@ep-misty-silence-b6n7k8ez.c-2.sa-east-1.aws.neon.tech/idriacho1_hml?sslmode=require";
const QA_URL = `postgresql://qa:super-secret-db-pass@${QA_BRANCH_ID}.c-2.sa-east-1.aws.neon.tech/idriacho1_hml?sslmode=require`;

function qaEnv(extra = {}) {
  return { QA_SEED_CONFIRM: QA_CONFIRM, IDBRF_RUNTIME_STAGE: "qa", ...extra };
}

function memoryPrisma(identity) {
  const tables = new Map();
  const rows = (name) => {
    if (!tables.has(name)) tables.set(name, []);
    return tables.get(name);
  };
  const matches = (row, where) => !where || Object.entries(where).every(([key, value]) => {
    if (value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date) && !Buffer.isBuffer(value)) {
      if (Array.isArray(value.in)) return value.in.includes(row[key]);
      return matches(row, value);
    }
    return row[key] === value;
  });
  const model = (name) => ({
    async findUnique({ where }) { return rows(name).find((row) => matches(row, where)) ?? null; },
    async findFirst({ where }) { return rows(name).find((row) => matches(row, where)) ?? null; },
    async upsert({ where, create, update }) {
      const existing = rows(name).find((row) => matches(row, where));
      if (existing) {
        Object.assign(existing, update);
        return existing;
      }
      const created = { ...create };
      rows(name).push(created);
      return created;
    },
  });
  const prisma = {
    organization: model("organization"),
    church: model("church"),
    household: model("household"),
    person: model("person"),
    personPhoto: model("personPhoto"),
    churchMembership: model("churchMembership"),
    memberCredential: model("memberCredential"),
    portalEvent: model("portalEvent"),
    eventModality: model("eventModality"),
    eventLot: model("eventLot"),
    eventRegistration: model("eventRegistration"),
    eventParticipantTicket: model("eventParticipantTicket"),
    eventPaymentIntent: model("eventPaymentIntent"),
    async $queryRawUnsafe(sql) {
      assert.equal(sql.includes("current_database()"), true);
      assert.equal(/insert|update|delete/i.test(sql), false);
      return [{ database_name: identity.databaseName, branch_id: identity.branchId }];
    },
    async $transaction(fn) { return fn(prisma); },
    size(name) { return rows(name).length; },
    snapshot() {
      return JSON.stringify([...tables.entries()].map(([name, value]) => [name, value]));
    },
  };
  return prisma;
}

async function seedChurch(prisma) {
  await prisma.organization.upsert({
    where: { slug: "igreja-de-deus" },
    create: { id: "org-qa", slug: "igreja-de-deus", name: "Igreja de Deus" },
    update: {},
  });
  await prisma.church.upsert({
    where: { organizationId_slug: { organizationId: "org-qa", slug: "riacho-fundo-1" } },
    create: { id: "church-qa", organizationId: "org-qa", slug: "riacho-fundo-1", name: "Riacho Fundo I" },
    update: {},
  });
}

test("o plano usa as 19 imagens e não carrega dado real", () => {
  const files = listQaImageFiles(repoRoot);
  const plan = buildQaImagePlan(NOW);
  assert.equal(plan.sourceCommit, IMAGE_SOURCE_COMMIT);
  assert.deepEqual(files.people, plan.people.map((person) => person.file));
  assert.deepEqual(files.events, [...new Set(plan.events.map((event) => event.file))].sort());
  assert.equal(plan.people.length, 12);
  assert.equal(plan.events.filter((event) => event.when === "future").length, 6);
  assert.equal(plan.events.filter((event) => event.when === "past").length, 4);
  assert.equal(plan.events.find((event) => event.slug === "qa-dev-so-para-mocas").ticketPolicy, "PARTICIPANT");
  assert.equal(plan.events.every((event) => event.featuredOnHome === false), true);
  assert.equal(plan.people[0].birthDate, "1992-11-21");
  assert.equal(plan.people[1].birthDate, "1986-11-22");
  assert.equal(JSON.stringify(buildQaImagePlan(NOW)), JSON.stringify(plan));
  for (const person of plan.people) {
    assert.match(person.id, /^qaImg/);
    assert.match(person.email, /@example\.test$/);
    assert.equal(person.credential ? /^[A-Za-z]{32}$/.test(person.credential.opaqueToken) : true, true);
    assert.equal(existsSync(join(repoRoot, "apps/web/public/images/qa/people", person.file)), true);
  }
  const partySizes = plan.registrations.map((item) => item.partySize).sort();
  assert.equal(partySizes.includes(1), true);
  assert.equal(partySizes.includes(3), true);
  assert.equal(plan.payments.every((item) => item.providerRef.startsWith("qa-mock-")), true);
  assert.equal(JSON.stringify(plan).includes("password"), false);
  assert.equal(/\d{3}\.\d{3}\.\d{3}-\d{2}/.test(JSON.stringify(plan)), false);
  assert.equal(JSON.stringify(publicEventCards(plan)).includes("@"), false);
  assert.equal(stableOpaqueToken("pessoa-01"), plan.people[0].credential.opaqueToken);
});

test("as oito personas e o convidado apontam para a massa QA sem senha", () => {
  assert.deepEqual(PERSONA_VIEWS.map((persona) => persona.id), [
    "admin", "secretaria", "pastor", "tesouraria", "lider", "membro", "editor", "publicador", "convidado",
  ]);
  assert.equal(PERSONA_VIEWS.some((persona) => "password" in persona), false);
  assert.equal(PERSONA_VIEWS.find((persona) => persona.id === "convidado").account, null);
  assert.match(PERSONA_VIEWS.find((persona) => persona.id === "convidado").route, /qa-dev-so-para-mocas/);
});

test("a guarda recusa HML, produção e outro endpoint antes de conectar", () => {
  assert.equal(assertQaSeedTarget({ mode: "dry-run", env: {} }).offline, true);
  assert.throws(() => assertQaSeedTarget({ mode: "dry-run", env: { IDBRF_RUNTIME_STAGE: "production" } }), SeedGuardError);
  assert.throws(() => assertQaSeedTarget({ mode: "apply", env: qaEnv() }), /DATABASE_URL/);
  assert.throws(() => assertQaSeedTarget({
    mode: "apply", databaseUrl: SECRET_URL, env: qaEnv(),
  }), /outro ambiente|ramo QA/);
  assert.throws(() => assertQaSeedTarget({
    mode: "apply", databaseUrl: QA_URL, env: qaEnv({ IDBRF_RUNTIME_STAGE: "hml" }),
  }), /production ou hml/);
  assert.throws(() => assertQaSeedTarget({
    mode: "apply", databaseUrl: QA_URL, env: { IDBRF_RUNTIME_STAGE: "qa" },
  }), /QA_SEED_CONFIRM/);
  assert.throws(() => assertQaSeedTarget({
    mode: "apply", databaseUrl: QA_URL.replace("sslmode=require", "sslmode=disable"), env: qaEnv(),
  }), /sslmode/);
  assert.throws(() => assertQaSeedTarget({
    mode: "apply",
    databaseUrl: `postgresql://qa:secret@${QA_BRANCH_ID}.neon.tech.evil.test/${QA_DATABASE_NAME}?sslmode=require`,
    env: qaEnv(),
  }), /ramo QA|localhost/);
  const allowed = assertQaSeedTarget({ mode: "apply", databaseUrl: QA_URL, env: qaEnv() });
  assert.equal(allowed.place, "neon-qa");
  assert.equal(allowed.databaseName, QA_DATABASE_NAME);
  const local = assertQaSeedTarget({
    mode: "apply",
    databaseUrl: `postgresql://idbrf:secret@127.0.0.1:5432/${CI_DATABASE_NAME}`,
    env: { QA_SEED_CI: "1", QA_SEED_CONFIRM: CI_CONFIRM, IDBRF_RUNTIME_STAGE: "qa" },
  });
  assert.equal(local.place, "ci-local");
  assert.throws(() => assertLiveQaIdentity([{ database_name: "postgres", branch_id: QA_BRANCH_ID }], allowed), /current_database/);
  assert.throws(() => assertLiveQaIdentity([{ database_name: QA_DATABASE_NAME, branch_id: "br-outro" }], allowed), /branch_id/);
});

test("duas gravações no banco fictício mantêm os mesmos registros", async () => {
  const plan = buildQaImagePlan(NOW);
  const portraits = new Map(plan.people.map((person) => [person.id, Buffer.from([0xff, 0xd8, 0xff, 0x00])]));
  const prisma = memoryPrisma({ databaseName: CI_DATABASE_NAME, branchId: null });
  await seedChurch(prisma);
  const target = { place: "ci-local", databaseName: CI_DATABASE_NAME };
  await applyQaImagePlan(prisma, plan, portraits, target);
  const first = prisma.snapshot();
  await applyQaImagePlan(prisma, plan, portraits, target);
  assert.equal(prisma.snapshot(), first);
  assert.equal(prisma.size("person"), 12);
  assert.equal(prisma.size("personPhoto"), 12);
  assert.equal(prisma.size("portalEvent"), 10);
  assert.equal(prisma.size("organization"), 1);
});

test("não sobrescreve cadastro que já usa um ID QA", async () => {
  const plan = buildQaImagePlan(NOW);
  const portraits = new Map(plan.people.map((person) => [person.id, Buffer.from([0xff, 0xd8, 0xff])]));
  const prisma = memoryPrisma({ databaseName: CI_DATABASE_NAME, branchId: null });
  await seedChurch(prisma);
  await prisma.person.upsert({
    where: { id: "qaImgPerson01" },
    create: { id: "qaImgPerson01", email: "outra.pessoa@example.test", displayName: "Outra" },
    update: {},
  });
  await assert.rejects(
    () => applyQaImagePlan(prisma, plan, portraits, { place: "ci-local", databaseName: CI_DATABASE_NAME }),
    /outro cadastro/,
  );
  assert.equal(prisma.size("personPhoto"), 0);
  assert.equal(prisma.size("portalEvent"), 0);
});

test("os retratos SVG viram JPEG dentro do limite da ficha", async () => {
  const plan = buildQaImagePlan(NOW);
  const first = await renderQaPortrait(join(repoRoot, "apps/web/public/images/qa/people", plan.people[0].file));
  const second = await renderQaPortrait(join(repoRoot, "apps/web/public/images/qa/people", plan.people[0].file));
  assert.equal(Buffer.compare(assertJpegPortrait(first), second), 0);
  for (const person of plan.people) {
    const jpeg = await renderQaPortrait(join(repoRoot, "apps/web/public/images/qa/people", person.file));
    assertJpegPortrait(jpeg);
  }
});

test("o comando padrão não conecta e não imprime a URL", async () => {
  const report = await runSeed({ mode: "dry-run", databaseUrl: SECRET_URL, env: { IDBRF_RUNTIME_STAGE: "qa" }, now: NOW });
  assert.equal(report.report.persisted, false);
  assert.equal(report.report.people, 12);
  assert.equal(JSON.stringify(report.report).includes("super-secret-db-pass"), false);
  assert.equal(JSON.stringify(report.report).includes("ep-misty-silence"), false);
  const dry = spawnSync(process.execPath, ["scripts/qa/seed-complete-dev.mjs", "--dry-run"], {
    cwd: repoRoot,
    env: { ...process.env, DATABASE_URL: SECRET_URL, IDBRF_RUNTIME_STAGE: "qa" },
    encoding: "utf8",
  });
  assert.equal(dry.status, 0, dry.stderr);
  assert.equal(dry.stdout.includes("super-secret-db-pass"), false);
  assert.equal(parseSeedArgs(["--apply"]).mode, "apply");
  const blocked = spawnSync(process.execPath, ["scripts/qa/seed-complete-dev.mjs", "--apply"], {
    cwd: repoRoot,
    env: { ...process.env, DATABASE_URL: SECRET_URL, ...qaEnv() },
    encoding: "utf8",
  });
  assert.equal(blocked.status, 2);
  assert.match(blocked.stderr, /BLOQUEADO/);
  assert.equal(`${blocked.stdout}${blocked.stderr}`.includes("super-secret-db-pass"), false);
  assert.equal(publicFailure(new Error("postgres://qa:super-secret-db-pass@br-twilight-bonus-b6moawk7.neon.tech/idriacho1_hml")).includes("super-secret"), false);
  assert.equal(publicFailure(new SeedGuardError("BLOQUEADO: exemplo")), "BLOQUEADO: exemplo");
});
