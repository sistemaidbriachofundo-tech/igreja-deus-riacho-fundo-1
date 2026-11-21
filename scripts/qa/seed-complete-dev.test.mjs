import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { applyQaMass } from "./apply.mjs";
import { buildCatalog, summarize } from "./catalog.mjs";
import { assertSeedTarget, SeedGuardError } from "./guard.mjs";
import { jpegSize, portraitJpeg } from "./jpeg.mjs";

const NOW = new Date("2026-11-21T15:00:00.000Z");
const QA_URL = "postgresql://qa:segredo-nao-logar@ep-qa.c-2.sa-east-1.aws.neon.tech/idriacho1_hml?sslmode=require&application_name=flat-tree-17047178-br-twilight-bonus-b6moawk7";

function memoryDb() {
  const tables = new Map();
  const userUpdates = [];
  const rows = (model) => {
    if (!tables.has(model)) tables.set(model, []);
    return tables.get(model);
  };
  const matches = (row, where) => Object.entries(where).every(([key, value]) => row[key] === value);
  const delegate = (model) => ({
    async findFirst({ where }) {
      return rows(model).find((row) => matches(row, where)) ?? null;
    },
    async findUnique({ where }) {
      return rows(model).find((row) => matches(row, where)) ?? null;
    },
    async upsert({ where, create, update }) {
      const found = rows(model).find((row) => matches(row, where));
      if (found) {
        if (model === "user") userUpdates.push({ ...update });
        Object.assign(found, update);
        return found;
      }
      const created = { ...create };
      rows(model).push(created);
      return created;
    },
    async create({ data }) {
      const created = { ...data };
      rows(model).push(created);
      return created;
    },
    async update({ where, data }) {
      const found = rows(model).find((row) => matches(row, where));
      if (!found) throw new Error(`update sem linha em ${model}`);
      if (model === "user") userUpdates.push({ ...data });
      Object.assign(found, data);
      return found;
    },
  });
  return {
    userUpdates,
    tables,
    db: new Proxy({}, { get: (_target, model) => delegate(model) }),
  };
}

function seedChurch(memory) {
  memory.db.organization.create({ data: { id: "org-piloto", slug: "igreja-de-deus" } });
  memory.db.church.create({ data: { id: "church-piloto", organizationId: "org-piloto", slug: "riacho-fundo-1" } });
}

test("o plano offline não abre banco", () => {
  const decision = assertSeedTarget({ mode: "dry-run", env: {} });
  assert.equal(decision.offline, true);
  assert.equal(decision.persisted, false);
});

test("recusa HML, produção e Neon sem o ramo QA", () => {
  assert.throws(
    () => assertSeedTarget({ mode: "apply", databaseUrl: QA_URL, env: { IDBRF_RUNTIME_STAGE: "production" } }),
    SeedGuardError,
  );
  assert.throws(
    () => assertSeedTarget({ mode: "apply", databaseUrl: QA_URL, env: { IDBRF_RUNTIME_STAGE: "hml" } }),
    SeedGuardError,
  );
  assert.throws(
    () => assertSeedTarget({
      mode: "dry-run",
      databaseUrl: "postgresql://qa:segredo@ep-hml.sa-east-1.aws.neon.tech/idriacho1_hml?sslmode=require",
      env: { IDBRF_RUNTIME_STAGE: "qa", QA_SEED_CONFIRM: "br-twilight-bonus-b6moawk7", QA_SEED_PROJECT: "flat-tree-17047178" },
    }),
    /ramo/,
  );
  assert.throws(
    () => assertSeedTarget({
      mode: "apply",
      databaseUrl: QA_URL,
      env: {
        IDBRF_RUNTIME_STAGE: "qa",
        QA_SEED_CONFIRM: "br-twilight-bonus-b6moawk7",
        QA_SEED_PROJECT: "flat-tree-17047178",
      },
    }),
    /QA_SEED_OPERATOR/,
  );
});

test("autoriza o apply só com projeto, ramo, estágio e operador", () => {
  const decision = assertSeedTarget({
    mode: "apply",
    databaseUrl: QA_URL,
    env: {
      IDBRF_RUNTIME_STAGE: "non-production",
      QA_SEED_CONFIRM: "br-twilight-bonus-b6moawk7",
      QA_SEED_PROJECT: "flat-tree-17047178",
      QA_SEED_OPERATOR: "qa-dev",
    },
  });
  assert.equal(decision.place, "neon-qa");
  assert.equal(decision.databaseName, "idriacho1_hml");
  assert.equal(decision.persisted, true);
});

test("o catálogo cobre eventos, retratos e e-mails fictícios", () => {
  const catalog = buildCatalog(NOW);
  const summary = summarize(catalog);
  assert.ok(summary.people >= 30);
  assert.equal(summary.futureEvents >= 6, true);
  assert.equal(summary.pastEvents >= 4, true);
  assert.ok(summary.events.some((event) => event.name === "Só para Moças — DEMONSTRAÇÃO DEV" && event.ticketPolicy === "PARTICIPANT"));
  for (const name of ["Encontro de Homens", "Retiro de Famílias", "Enraizados", "Acolhimento", "Oficina paga"]) {
    assert.ok(summary.events.some((event) => event.name === name));
  }
  assert.ok(summary.events.filter((event) => event.tickets > 0).length > 0);
  assert.ok(catalog.events.some((event) => event.registrations.some((registration) => registration.partySize > 1 && registration.tickets.length > 1)));
  assert.ok(catalog.events.some((event) => event.registrations.some((registration) => registration.status === "PENDING_PAYMENT")));
  assert.ok(catalog.events.some((event) => event.lots.some((lot) => lot.status === "CLOSED" && lot.priceCents > 0)));
  const dumped = JSON.stringify(summary);
  assert.equal(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/.test(dumped), false);
  assert.equal(dumped.includes("password"), false);
  for (const person of catalog.people) {
    if (person.email) assert.equal(person.email.endsWith("@example.test"), true);
    const jpeg = portraitJpeg(person.portrait);
    assert.equal(jpeg.subarray(0, 3).toString("hex"), "ffd8ff");
    assert.equal(jpegSize(jpeg)?.width, 96);
    assert.ok(jpeg.length < 192 * 1024);
  }
  const first = portraitJpeg(catalog.people[0].portrait);
  const second = portraitJpeg(catalog.people[1].portrait);
  assert.equal(first.equals(second), false);
});

test("duas aplicações mantêm os mesmos registros e não redefinem senha", async () => {
  const catalog = buildCatalog(NOW);
  const first = memoryDb();
  await seedChurch(first);
  await applyQaMass(first.db, catalog);
  const snapshot = JSON.stringify(first.tables, (_key, value) => Buffer.isBuffer(value) ? `jpeg:${value.length}:${value.subarray(0, 3).toString("hex")}` : value);
  const second = memoryDb();
  second.tables.clear();
  for (const [model, rows] of first.tables) second.tables.set(model, rows.map((row) => ({ ...row })));
  await applyQaMass(second.db, catalog);
  const again = JSON.stringify(second.tables, (_key, value) => Buffer.isBuffer(value) ? `jpeg:${value.length}:${value.subarray(0, 3).toString("hex")}` : value);
  assert.equal(again, snapshot);
  assert.ok(second.userUpdates.length > 0);
  for (const update of second.userUpdates) assert.equal(Object.hasOwn(update, "passwordHash"), false);
  const photos = second.tables.get("personPhoto");
  assert.equal(photos.length, catalog.people.length);
  assert.ok(photos.every((photo) => photo.personId.startsWith("qacomp_person_") && photo.jpeg[0] === 0xff));
  const moças = second.tables.get("portalEvent").find((event) => event.slug === "qacomp-mocas");
  assert.equal(moças.ticketPolicy, "PARTICIPANT");
  assert.equal(moças.imageUrl, "/images/qa/events/qacomp-mocas.jpg");
});

test("a segunda execução do plano é idêntica e o CLI não imprime a URL", () => {
  const directory = mkdtempSync(join(tmpdir(), "qa-seed-"));
  const report = join(directory, "report.json");
  const result = spawnSync(process.execPath, ["scripts/qa/seed-complete-dev.mjs", "--report", report], {
    cwd: fileURLToPath(new URL("../..", import.meta.url)),
    env: {
      ...process.env,
      DATABASE_URL: "postgresql://qa:segredo-nao-logar@ep-hml.sa-east-1.aws.neon.tech/outro_banco",
      IDBRF_RUNTIME_STAGE: "qa",
    },
    encoding: "utf8",
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /BLOQUEADO/);
  assert.equal(result.stderr.includes("segredo-nao-logar"), false);
  assert.equal(result.stdout.includes("segredo-nao-logar"), false);

  const offline = spawnSync(process.execPath, ["scripts/qa/seed-complete-dev.mjs", "--dry-run"], {
    cwd: fileURLToPath(new URL("../..", import.meta.url)),
    env: { ...process.env, DATABASE_URL: "" },
    encoding: "utf8",
  });
  assert.equal(offline.status, 0);
  const body = JSON.parse(offline.stdout);
  assert.equal(body.persisted, false);
  assert.equal(body.planned.futureEvents >= 6, true);
  assert.equal(offline.stdout.includes("postgresql://"), false);
});
