import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { evaluateSources, lineOf, summarize } from "./static-scan.mjs";

const root = new URL("../../../", import.meta.url);

function readRepo() {
  const files = {};
  for (const path of [
    "apps/api/src/auth/auth.service.ts",
    "apps/api/src/auth/auth.controller.ts",
    "apps/api/src/auth/mfa/mfa.controller.ts",
    "apps/api/src/auth/mfa/mfa.service.ts",
    "apps/api/src/auth/mfa/mfa-crypto.util.ts",
    "apps/api/src/main.ts",
    "apps/api/src/app.module.ts",
    "apps/api/src/common/simple-rate-limit.middleware.ts",
    "apps/api/src/auth/guards/jwt-auth.guard.ts",
    "apps/api/src/auth/guards/access-policy.guard.ts",
    "apps/api/src/finance/finance.service.ts",
    "apps/api/src/finance/finance.controller.ts",
    "apps/api/src/cms/site-media.service.ts",
    "apps/api/src/audit/audit-metadata.redactor.ts",
    "apps/api/src/audit/audit.service.ts",
    "apps/api/src/pastoral/pastoral.controller.ts",
    "apps/api/src/persons/persons.service.ts",
    "apps/api/src/credentials/credentials.service.ts",
    "apps/api/src/events/event-registrations.service.ts",
    "apps/api/src/treasury/treasury.service.ts",
    "apps/api/src/health.service.ts",
    "packages/db/prisma/schema.prisma",
    "packages/shared/src/credential-token.ts",
  ]) {
    files[path] = readFileSync(new URL(path, root), "utf8");
  }
  return files;
}

describe("scanner estático da candidata", () => {
  const controls = evaluateSources(readRepo());
  const byId = Object.fromEntries(controls.map((item) => [item.id, item]));

  it("não trata controle fechado no fonte como prova de deploy", () => {
    const summary = summarize(controls);
    assert.equal(summary.e2e.BLOCKED, controls.length);
    assert.ok(summary.blockers.every((item) => item.severity === "P0"));
  });

  it("aponta 500 no QR público quando o token curto vira Error comum", () => {
    assert.equal(byId["F11-QR-02"].static, "FAIL");
  });

  it("reconhece controles que o fonte já fecha, sem tratar isso como prova de deploy", () => {
    for (const id of [
      "F11-MFA-01",
      "F11-MFA-02",
      "F11-JWT-01",
      "F11-JWT-02",
      "F11-JWT-03",
      "F11-RATE-01",
      "F11-PERSON-01",
      "F11-PASTORAL-01",
      "F11-QR-01",
      "F11-UP-02",
      "F11-CSRF-01",
    ]) {
      assert.equal(byId[id].static, "PASS", id);
      assert.equal(byId[id].e2e, "BLOCKED", id);
    }
  });

  it("fecha os P0 estáticos de MFA, sessão e limite sem promover o E2E", () => {
    const summary = summarize(controls);
    assert.equal(summary.blockers.length, 0);
    assert.equal(summary.e2e.BLOCKED, controls.length);
  });
});

describe("o mesmo controle passa quando o login devolve o desafio antes do JWT", () => {
  it("não acusa emissão plena se o retorno do desafio vem primeiro", () => {
    const files = readRepo();
    files["apps/api/src/auth/auth.service.ts"] = files["apps/api/src/auth/auth.service.ts"]
      .replace(
        "return {\n      ...this.issueTokenPair(authUser),",
        "if (mfaRequired && mfaEnabled) {\n      return { challenge: \"opaque\", tokenType: \"Bearer\" as const };\n    }\n    return {\n      ...this.issueTokenPair(authUser),",
      );
    const login = evaluateSources(files).find((item) => item.id === "F11-MFA-01");
    assert.equal(login.static, "PASS");
  });
});

describe("linhas", () => {
  it("conta a partir de 1", () => {
    assert.equal(lineOf("a\nb\nc", "c"), 3);
    assert.equal(lineOf("a", "z"), null);
  });
});
