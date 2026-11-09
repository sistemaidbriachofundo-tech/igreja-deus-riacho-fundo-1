import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  HML_PERSONAS,
  evaluateEklesiaRelease,
  pagesReleaseDocument,
  type AnonymousProbe,
  type EklesiaObservation,
  type FrontId,
  type FrontReport,
} from "./eklesia-gate";

const SHA = "ca00a4fd2c5d1f87cca815c3822a35cb9a92c3c2";

const PRIVATE = [
  "/auth/me",
  "/persons/search?q=sintetico",
  "/admissions",
  "/ministry-scope/min-homens/formal-memberships",
];

function probes(privateStatus: number, leak = false): AnonymousProbe[] {
  return [
    ...PRIVATE.map((path) => ({
      method: "GET" as const,
      path,
      status: privateStatus,
      kind: "private" as const,
      leak: false,
    })),
    { method: "GET", path: "/public/home", status: 200, kind: "public", leak },
    { method: "POST", path: "/auth/login", status: 400, kind: "reject-login", leak: false },
    { method: "OPTIONS", path: "/public/vivi/chat", status: 204, kind: "cors", leak: false },
  ];
}

function fronts(acceptance: FrontReport["acceptance"] = "PASS"): FrontReport[] {
  const ids: Array<[FrontId, number]> = [
    ["A", 126],
    ["B", 127],
    ["C", 128],
    ["D", 129],
    ["E", 130],
    ["F", 131],
    ["G", 132],
  ];
  return ids.map(([id, issue]) => ({
    id,
    issue,
    pullRequest: 200 + issue,
    pullState: "merged",
    acceptance,
    evidence: `Frente ${id} aceita neste fixture.`,
  }));
}

function ready(overrides: Partial<EklesiaObservation> = {}): EklesiaObservation {
  return {
    expectedContractVersion: "0.7.4-rf025",
    expectedSourceSha: SHA,
    apiHealthStatus: 200,
    apiContractVersion: "0.7.4-rf025",
    apiSourceSha: SHA,
    probes: probes(401),
    pages: {
      homeStatus: 200,
      churchName: true,
      demoSeed: false,
      publicNav: true,
      releaseSha: SHA,
      releasePhase: "EM_EXECUCAO",
    },
    fronts: fronts(),
    personas: HML_PERSONAS.map((id) => ({
      id,
      status: "PASS" as const,
      evidence: `${id} autenticada em fixture.`,
    })),
    ministryMembershipModel: true,
    ownRosterRoute: true,
    vercelTokenPresent: false,
    ...overrides,
  };
}

describe("pagesReleaseDocument", () => {
  it("carimba o SHA só no push da main e nunca conclui a fase", () => {
    assert.deepEqual(pagesReleaseDocument({
      eventName: "push",
      ref: "refs/heads/main",
      sha: SHA,
    }), {
      channel: "github-pages",
      sourceSha: SHA,
      phase: "EM_EXECUCAO",
      officialUrl: "https://sistemaidbriachofundo-tech.github.io/igreja-deus-riacho-fundo-1/",
      apiOrigin: "https://id-riacho1-api-hml.vercel.app",
    });
  });

  it("deixa o preview sem SHA oficial", () => {
    const preview = pagesReleaseDocument({
      eventName: "pull_request",
      ref: "refs/pull/133/merge",
      sha: SHA,
    });
    assert.equal(preview.channel, "preview");
    assert.equal(preview.sourceSha, null);
    assert.equal(preview.phase, "EM_EXECUCAO");
    assert.equal(preview.apiOrigin, null);
  });
});

describe("evaluateEklesiaRelease", () => {
  it("só conclui quando contrato, SHA, segurança e as oito personas passam", () => {
    const verdict = evaluateEklesiaRelease(ready());
    assert.equal(verdict.releaseComplete, true);
    assert.equal(verdict.phase, "CONCLUIDA");
    assert.equal(verdict.checks.every((check) => check.status === "PASS"), true);
    assert.equal(verdict.checks.filter((check) => check.id.startsWith("persona-")).length, 8);
  });

  it("falha o contrato quando a API HML está atrás e não conclui a fase", () => {
    const verdict = evaluateEklesiaRelease(ready({
      apiContractVersion: "0.7.2-f2",
      apiSourceSha: null,
      ministryMembershipModel: false,
      ownRosterRoute: false,
      fronts: fronts("BLOCKED"),
      personas: HML_PERSONAS.map((id) => ({
        id,
        status: "BLOCKED" as const,
        evidence: "sem sessão",
      })),
      probes: probes(401).map((probe) =>
        probe.path.includes("ministry-scope") ? { ...probe, status: 404 } : probe,
      ),
    }));
    assert.equal(verdict.releaseComplete, false);
    assert.equal(verdict.phase, "EM_EXECUCAO");
    assert.equal(verdict.checks.find((check) => check.id === "api-contract")?.status, "FAIL");
    assert.equal(verdict.checks.find((check) => check.id === "api-sha")?.status, "BLOCKED");
    assert.equal(verdict.checks.find((check) => check.id === "api-deploy")?.status, "BLOCKED");
    assert.equal(verdict.checks.find((check) => check.id === "api-anon")?.status, "PASS");
    assert.equal(verdict.checks.find((check) => check.id === "api-route-coverage")?.status, "BLOCKED");
    assert.equal(verdict.checks.find((check) => check.id === "schema-ministry")?.status, "BLOCKED");
    assert.equal(verdict.checks.find((check) => check.id === "own-roster")?.status, "BLOCKED");
    assert.equal(verdict.checks.find((check) => check.id === "persona-membro")?.status, "BLOCKED");
  });

  it("trata 200 anônimo e seed demonstrativo como falha", () => {
    const verdict = evaluateEklesiaRelease(ready({
      probes: probes(200, true),
      pages: {
        homeStatus: 200,
        churchName: true,
        demoSeed: true,
        publicNav: false,
        releaseSha: "0".repeat(40),
        releasePhase: "CONCLUIDA",
      },
    }));
    assert.equal(verdict.releaseComplete, false);
    assert.equal(verdict.checks.find((check) => check.id === "api-anon")?.status, "FAIL");
    assert.equal(verdict.checks.find((check) => check.id === "api-public")?.status, "FAIL");
    assert.equal(verdict.checks.find((check) => check.id === "pages-home")?.status, "FAIL");
    assert.equal(verdict.checks.find((check) => check.id === "pages-nav")?.status, "FAIL");
    assert.equal(verdict.checks.find((check) => check.id === "pages-sha")?.status, "FAIL");
  });

  it("recusa login vazio aceito", () => {
    const verdict = evaluateEklesiaRelease(ready({
      probes: probes(401).map((probe) =>
        probe.kind === "reject-login" ? { ...probe, status: 200 } : probe,
      ),
    }));
    assert.equal(verdict.checks.find((check) => check.id === "api-login-empty")?.status, "FAIL");
    assert.equal(verdict.releaseComplete, false);
  });
});
