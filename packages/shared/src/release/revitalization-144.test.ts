import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HML_PERSONAS, type PersonaId } from "./eklesia-gate";
import {
  HML_ENVIRONMENT_LABEL,
  PRESERVED_HML_PERSON_BASELINE,
  REVITALIZATION_FRONT_IDS,
  REVITALIZATION_OWNERSHIP,
  credentialPreviewLeaksSensitive,
  databaseNameFromUrl,
  decideHmlMigrate,
  evaluateRevitalization144,
  ministryNavItems,
  ownersOfPath,
  toCredentialPreview,
  type FrontDelivery,
  type RevitalizationFrontId,
  type RevitalizationObservation,
  type SeedObservation,
} from "./revitalization-144";

const SHA = "3c7375c23b7a4ed4d5e18618f34ec80d7fd43ac3";

function fronts(acceptance: FrontDelivery["acceptance"] = "PASS"): FrontDelivery[] {
  return REVITALIZATION_FRONT_IDS.map((id) => ({
    id,
    issue: 145 + REVITALIZATION_FRONT_IDS.indexOf(id),
    pullRequest: acceptance === "PASS" ? 200 : null,
    acceptance,
    evidence: `Frente ${id} neste fixture.`,
  }));
}

function personas(status: "PASS" | "FAIL" | "BLOCKED" = "PASS") {
  return HML_PERSONAS.map((id: PersonaId) => ({
    id,
    status,
    evidence: `${id} neste fixture.`,
  }));
}

function seed(overrides: Partial<SeedObservation> = {}): SeedObservation {
  return {
    attempted: true,
    database: "idriacho1_hml",
    personsBefore: PRESERVED_HML_PERSON_BASELINE,
    personsAfter: PRESERVED_HML_PERSON_BASELINE + 12,
    passwordsReset: false,
    ...overrides,
  };
}

function ready(overrides: Partial<RevitalizationObservation> = {}): RevitalizationObservation {
  return {
    expectedSourceSha: SHA,
    pagesSourceSha: SHA,
    apiSourceSha: SHA,
    apiContractVersion: "0.7.4-rf025",
    expectedContractVersion: "0.7.4-rf025",
    ministryMembershipTableReady: true,
    fronts: fronts(),
    personas: personas(),
    userFacing501Count: 0,
    localStorageFallbackCount: 0,
    seed: seed(),
    deployAuthorized: true,
    ...overrides,
  };
}

describe("revitalização 144", () => {
  it("não marca homologação quando as frentes A–I ainda não entregaram", () => {
    const verdict = evaluateRevitalization144(ready({
      fronts: fronts("BLOCKED"),
      personas: personas("BLOCKED"),
      ministryMembershipTableReady: null,
      userFacing501Count: 2,
      localStorageFallbackCount: 1,
      seed: seed({ attempted: false, personsBefore: null, personsAfter: null }),
      pagesSourceSha: null,
      apiSourceSha: null,
      deployAuthorized: false,
    }));
    assert.equal(verdict.phase, "EM_EXECUCAO");
    assert.equal(verdict.releaseComplete, false);
    assert.equal(verdict.checks.find((check) => check.id === "front-A")?.status, "BLOCKED");
    assert.equal(verdict.checks.find((check) => check.id === "deploy")?.status, "BLOCKED");
    assert.equal(verdict.checks.some((check) => check.status === "PASS" && check.id === "deploy"), false);
  });

  it("não abre deploy só porque o produto do fixture está verde", () => {
    const verdict = evaluateRevitalization144(ready({ deployAuthorized: false }));
    assert.equal(verdict.releaseComplete, false);
    assert.equal(verdict.checks.find((check) => check.id === "deploy")?.status, "BLOCKED");
    assert.equal(verdict.checks.filter((check) => check.id !== "deploy").every((check) => check.status === "PASS"), true);
  });

  it("só conclui no fixture em que produto e deploy passaram juntos", () => {
    const verdict = evaluateRevitalization144(ready());
    assert.equal(verdict.phase, "PRONTO_PARA_HOMOLOGACAO");
    assert.equal(verdict.releaseComplete, true);
  });

  it("recusa massa que reduz pessoas, erra o banco ou reseta senha", () => {
    const reduced = evaluateRevitalization144(ready({
      seed: seed({ personsAfter: PRESERVED_HML_PERSON_BASELINE - 1 }),
    }));
    assert.equal(reduced.checks.find((check) => check.id === "seed-preserve")?.status, "FAIL");

    const wrongDb = evaluateRevitalization144(ready({
      seed: seed({ database: "postgres" }),
    }));
    assert.equal(wrongDb.checks.find((check) => check.id === "seed-preserve")?.status, "FAIL");

    const reset = evaluateRevitalization144(ready({
      seed: seed({ passwordsReset: true }),
    }));
    assert.equal(reset.checks.find((check) => check.id === "seed-preserve")?.status, "FAIL");
    assert.equal(reset.releaseComplete, false);
  });

  it("isola o nome do banco e não ecoa a credencial", () => {
    const url = "postgresql://idbrf:segredo-nao-logar@ep-example.neon.tech:5432/idriacho1_hml?sslmode=require";
    assert.equal(databaseNameFromUrl(url), "idriacho1_hml");
    assert.equal(databaseNameFromUrl("postgresql://idbrf:segredo-nao-logar@localhost:5432/postgres"), "postgres");
    assert.equal(databaseNameFromUrl(""), null);
    const refused = decideHmlMigrate({
      databaseUrl: "postgresql://idbrf:segredo-nao-logar@localhost:5432/postgres",
      mode: "apply",
      confirm: "idriacho1_hml",
      seedRequested: false,
    });
    assert.equal(refused.exitCode, 2);
    assert.equal(refused.message.includes("segredo-nao-logar"), false);
    const dry = decideHmlMigrate({
      databaseUrl: url,
      mode: "dry-run",
      confirm: undefined,
      seedRequested: false,
    });
    assert.equal(dry.action, "dry-run");
    assert.equal(dry.exitCode, 0);
    const seeded = decideHmlMigrate({
      databaseUrl: url,
      mode: "apply",
      confirm: "idriacho1_hml",
      seedRequested: true,
    });
    assert.equal(seeded.action, "refuse");
    const unconfirmed = decideHmlMigrate({
      databaseUrl: url,
      mode: "apply",
      confirm: undefined,
      seedRequested: false,
    });
    assert.equal(unconfirmed.exitCode, 2);
  });

  it("cada caminho de ownership tem um único dono", () => {
    for (const front of REVITALIZATION_OWNERSHIP) {
      for (const path of front.paths) {
        const sample = path.endsWith("/") || path.endsWith("-") ? `${path}arquivo.ts` : path;
        assert.deepEqual(ownersOfPath(sample), [front.id]);
      }
    }
    assert.deepEqual(ownersOfPath("apps/web/src/components/AppShell.tsx"), ["A"]);
    assert.deepEqual(ownersOfPath("apps/web/src/components/HmlPhaseOne.tsx"), ["B"]);
    assert.deepEqual(ownersOfPath("packages/db/prisma/schema.prisma"), ["J"]);
    assert.deepEqual(ownersOfPath("apps/web/src/app/globals.css"), ["H"]);
    assert.deepEqual(ownersOfPath("apps/web/src/app/app/demo/page.tsx"), []);
    assert.deepEqual(ownersOfPath("scripts/hml/release-migrate-guard.mjs"), ["J"]);
    assert.deepEqual(ownersOfPath("scripts/hml/presentation/seed-hml.mjs"), ["E"]);
  });

  it("monta a prévia da carteirinha sem CPF, telefone ou e-mail", () => {
    const preview = toCredentialPreview({
      personId: "person-joao",
      membershipId: "mem-1",
      displayName: "João Carvalho",
      statusLabel: "Ativa",
      photoUrl: "/images/synthetic/joao.svg",
      revoked: false,
      cpf: "00000000000",
      phone: "61999990000",
      email: "joao.carvalho@example.test",
    });
    assert.ok(preview);
    assert.equal(preview?.displayName, "João Carvalho");
    assert.equal(credentialPreviewLeaksSensitive({
      cpf: "00000000000",
      phone: "61999990000",
      email: "joao.carvalho@example.test",
    }, preview!), false);
    assert.equal(toCredentialPreview({ displayName: "Sem id" }), null);
  });

  it("não inventa ministério quando a API não devolve a equipe", () => {
    assert.deepEqual(ministryNavItems([]), []);
    assert.deepEqual(ministryNavItems([
      { id: "min-homens", name: "Homens", slug: "homens" },
      { ministryId: "min-homens", name: "Homens de Ação", slug: "homens-acao" },
      { id: "min-louvor", name: "Louvor", slug: "louvor" },
      { name: "Sem id", slug: "sem-id" },
    ]), [
      { ministryId: "min-homens", name: "Homens", slug: "homens" },
      { ministryId: "min-louvor", name: "Louvor", slug: "louvor" },
    ]);
    assert.equal(JSON.stringify(ministryNavItems([])).includes("Homens"), false);
  });

  it("publica um único rótulo discreto de homologação", () => {
    assert.equal(HML_ENVIRONMENT_LABEL, "Ambiente de homologação");
    assert.equal(HML_ENVIRONMENT_LABEL.toLowerCase().includes("demo"), false);
  });

  it("cobre as nove frentes e as oito personas no contrato", () => {
    assert.deepEqual([...REVITALIZATION_FRONT_IDS], ["A", "B", "C", "D", "E", "F", "G", "H", "I"]);
    assert.equal(HML_PERSONAS.length, 8);
    const ids = new Set<RevitalizationFrontId | "J">();
    for (const front of REVITALIZATION_OWNERSHIP) ids.add(front.id);
    assert.equal(ids.size, 10);
  });
});
