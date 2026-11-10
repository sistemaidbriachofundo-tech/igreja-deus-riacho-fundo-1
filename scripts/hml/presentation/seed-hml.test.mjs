import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { runSeed } from "./apply.mjs";
import { buildCatalog, PUBLIC_IMAGE_DIR } from "./catalog.mjs";
import { assertSeedTarget, SeedGuardError } from "./guard.mjs";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const cli = join(root, "scripts/hml/presentation/seed-hml.mjs");

function runCli(args, env) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

test("o catálogo usa nomes naturais e partidas dobradas", () => {
  const catalog = buildCatalog();
  const names = catalog.people.map((person) => person.displayName);
  assert.ok(names.includes("João Carvalho"));
  assert.ok(names.includes("Maria Ferreira"));
  assert.ok(names.includes("Paulo Mendes"));
  assert.ok(names.includes("Ana Ribeiro"));
  assert.equal(catalog.ledgerPosition.disponivelCents, 13500);
  assert.equal(catalog.participation.counts.checkedIn, 2);
  assert.equal(
    catalog.participation.rows.some((row) => row.displayName === "Lucas Carvalho"),
    false,
  );
  const serialized = JSON.stringify(catalog.people);
  assert.equal(serialized.includes("cpf"), false);
  assert.equal(serialized.includes("+55"), false);
});

test("a guarda recusa Neon que não seja idriacho1_hml", () => {
  assert.throws(
    () =>
      assertSeedTarget({
        mode: "apply",
        databaseUrl: "postgresql://idbrf:s3cret-db-pass@ep-abc.sa-east-1.aws.neon.tech/outro_banco",
        env: { HML_SEED_CONFIRM: "idriacho1_hml", HML_SEED_OPERATOR: "integrator-j" },
      }),
    SeedGuardError,
  );
});

test("a guarda recusa apply no Neon sem o integrador", () => {
  assert.throws(
    () =>
      assertSeedTarget({
        mode: "apply",
        databaseUrl: "postgresql://idbrf:s3cret-db-pass@ep-abc.sa-east-1.aws.neon.tech/idriacho1_hml",
        env: { HML_SEED_CONFIRM: "idriacho1_hml" },
      }),
    /integrator-j/,
  );
});

test("a guarda aceita dry-run no Neon confirmado e apply só com o integrador", () => {
  const url = "postgresql://idbrf:s3cret-db-pass@ep-abc.sa-east-1.aws.neon.tech/idriacho1_hml";
  const dry = assertSeedTarget({
    mode: "dry-run",
    databaseUrl: url,
    env: { HML_SEED_CONFIRM: "idriacho1_hml" },
  });
  assert.equal(dry.persisted, false);
  assert.equal(dry.databaseName, "idriacho1_hml");
  const apply = assertSeedTarget({
    mode: "apply",
    databaseUrl: url,
    env: { HML_SEED_CONFIRM: "idriacho1_hml", HML_SEED_OPERATOR: "integrator-j" },
  });
  assert.equal(apply.persisted, true);
});

test("a guarda recusa o Postgres de CI sem a flag local", () => {
  assert.throws(
    () =>
      assertSeedTarget({
        mode: "apply",
        databaseUrl: "postgresql://idbrf:idbrf_ci@localhost:5432/idbrf?schema=public",
        env: {},
      }),
    /HML_SEED_CI/,
  );
});

test("dry-run sem banco não conecta e não ecoa segredo", () => {
  const result = runCli(["--dry-run"], {
    DATABASE_URL: "",
    HML_SEED_CONFIRM: "",
    HML_SEED_OPERATOR: "",
  });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.mode, "offline-plan");
  assert.equal(report.persisted, false);
  assert.equal(report.planned.persons > 20, true);
  assert.equal(result.stdout.includes("s3cret"), false);
  assert.equal(result.stderr.includes("s3cret"), false);
  assert.match(result.stderr, /HOMOLOGAÇÃO/);
});

test("apply contra outro banco Neon falha sem imprimir a senha", () => {
  const result = runCli(["--apply"], {
    DATABASE_URL: "postgresql://idbrf:s3cret-db-pass@ep-abc.sa-east-1.aws.neon.tech/postgres",
    HML_SEED_CONFIRM: "idriacho1_hml",
    HML_SEED_OPERATOR: "integrator-j",
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /idriacho1_hml/);
  assert.equal(result.stdout.includes("s3cret-db-pass"), false);
  assert.equal(result.stderr.includes("s3cret-db-pass"), false);
});

test("os avatares são SVG geométricos, sem banco de imagem", () => {
  const catalog = buildCatalog();
  for (const person of catalog.people) {
    const path = join(root, PUBLIC_IMAGE_DIR, person.avatarFile);
    assert.equal(existsSync(path), true, path);
    const svg = readFileSync(path, "utf8");
    assert.match(svg, /<svg/);
    assert.equal(/unsplash|jpeg|exif|photo/i.test(svg), false);
  }
  const source = readFileSync(join(root, PUBLIC_IMAGE_DIR, "SOURCES.md"), "utf8");
  assert.match(source, /não são fotografias/i);
});

test("aplica, repete e reverte no Postgres local de CI", async (t) => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    t.skip("DATABASE_URL ausente");
    return;
  }
  try {
    assertSeedTarget({ mode: "apply", databaseUrl, env: { HML_SEED_CI: "1" } });
  } catch {
    t.skip("DATABASE_URL não é o Postgres local de CI");
    return;
  }
  let prisma;
  try {
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } }, log: ["error"] });
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    t.skip("client ou banco de CI indisponível");
    return;
  }
  const env = { HML_SEED_CI: "1" };
  const catalog = buildCatalog();
  try {
    const org = await prisma.organization.upsert({
      where: { slug: "igreja-de-deus" },
      update: {},
      create: { name: "Igreja de Deus — Riacho Fundo I", slug: "igreja-de-deus" },
    });
    const church = await prisma.church.upsert({
      where: { organizationId_slug: { organizationId: org.id, slug: "riacho-fundo-1" } },
      update: {},
      create: {
        organizationId: org.id,
        name: "Riacho Fundo I",
        slug: "riacho-fundo-1",
      },
    });
    await prisma.person.upsert({
      where: { id: "legacy_person_keep" },
      update: { displayName: "Pessoa já cadastrada", email: "legacy.keep@example.test" },
      create: {
        id: "legacy_person_keep",
        organizationId: org.id,
        homeChurchId: church.id,
        displayName: "Pessoa já cadastrada",
        email: "legacy.keep@example.test",
        kind: "MEMBER",
        status: "ACTIVE",
      },
    });
    const passwordHash = "$argon2id$legacy-marker-not-rewritten";
    await prisma.user.upsert({
      where: { email: "legacy.keep@example.test" },
      update: { passwordHash, status: "ACTIVE" },
      create: {
        id: "legacy_user_keep",
        personId: "legacy_person_keep",
        email: "legacy.keep@example.test",
        passwordHash,
        status: "ACTIVE",
      },
    });
    await prisma.ministry.upsert({
      where: { churchId_slug: { churchId: church.id, slug: "homens" } },
      update: { name: "Ministério de Homens" },
      create: {
        id: "legacy_ministry_homens",
        organizationId: org.id,
        churchId: church.id,
        name: "Ministério de Homens",
        slug: "homens",
        visibility: "INTERNAL",
        publishStatus: "DRAFT",
      },
    });

    const before = await prisma.person.count();
    const dry = await runSeed({ mode: "dry-run", databaseUrl, env });
    assert.equal(dry.rolledBack, true);
    assert.equal(dry.persisted, false);
    assert.equal(await prisma.person.count(), before);

    const applied = await runSeed({ mode: "apply", databaseUrl, env });
    assert.equal(applied.persisted, true);
    assert.equal(applied.delta.preservedPersons, 0);
    assert.equal(applied.after.seedPersons, catalog.people.length);
    assert.equal(applied.ministriesCreated.includes("homens"), false);
    const legacy = await prisma.user.findUniqueOrThrow({ where: { id: "legacy_user_keep" } });
    assert.equal(legacy.passwordHash, passwordHash);
    const kept = await prisma.person.findUniqueOrThrow({ where: { id: "legacy_person_keep" } });
    assert.equal(kept.displayName, "Pessoa já cadastrada");
    const homens = await prisma.ministry.findUniqueOrThrow({ where: { id: "legacy_ministry_homens" } });
    assert.equal(homens.name, "Ministério de Homens");
    const links = await prisma.ministryMembership.count({
      where: { ministryId: homens.id, id: { startsWith: "hmlpres_" } },
    });
    assert.ok(links >= 8);
    const cards = await prisma.memberCredential.findMany({
      where: { id: { startsWith: "hmlpres_cred_" } },
      select: { opaqueToken: true },
    });
    assert.equal(cards.length, catalog.credentials.length);
    assert.equal(cards.some((card) => card.opaqueToken.includes("@")), false);
    const lines = await prisma.ledgerEntryLine.findMany({
      where: { entryId: { startsWith: "hmlpres_entry_" } },
      select: { entryId: true, side: true, amountCents: true },
    });
    const totals = new Map();
    for (const line of lines) {
      const bucket = totals.get(line.entryId) ?? { debit: 0, credit: 0 };
      if (line.side === "DEBIT") bucket.debit += line.amountCents;
      else bucket.credit += line.amountCents;
      totals.set(line.entryId, bucket);
    }
    assert.equal(totals.size, catalog.ledgerEntries.length);
    for (const total of totals.values()) assert.equal(total.debit, total.credit);
    assert.equal(await prisma.communicationOutbox.count(), 0);

    const again = await runSeed({ mode: "apply", databaseUrl, env });
    assert.equal(again.delta.persons, 0);
    assert.equal(again.delta.seedPersons, 0);
    assert.equal(again.after.seedPersons, catalog.people.length);
    const legacyAgain = await prisma.user.findUniqueOrThrow({ where: { id: "legacy_user_keep" } });
    assert.equal(legacyAgain.passwordHash, passwordHash);

    const removed = await runSeed({ mode: "rollback", databaseUrl, env });
    assert.equal(removed.persisted, true);
    assert.equal(await prisma.person.count({ where: { id: { startsWith: "hmlpres_person_" } } }), 0);
    assert.equal(await prisma.ministryMembership.count({ where: { id: { startsWith: "hmlpres_" } } }), 0);
    assert.equal(await prisma.ledgerEntry.count({ where: { id: { startsWith: "hmlpres_" } } }), 0);
    const still = await prisma.person.findUniqueOrThrow({ where: { id: "legacy_person_keep" } });
    assert.equal(still.displayName, "Pessoa já cadastrada");
    assert.equal(
      (await prisma.user.findUniqueOrThrow({ where: { id: "legacy_user_keep" } })).passwordHash,
      passwordHash,
    );
    assert.equal((await prisma.ministry.findUniqueOrThrow({ where: { id: "legacy_ministry_homens" } })).name, "Ministério de Homens");
  } finally {
    await runSeed({ mode: "rollback", databaseUrl, env }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: "legacy_user_keep" } });
    await prisma.person.deleteMany({ where: { id: "legacy_person_keep" } });
    await prisma.ministry.deleteMany({ where: { id: "legacy_ministry_homens" } });
    await prisma.$disconnect();
  }
});
