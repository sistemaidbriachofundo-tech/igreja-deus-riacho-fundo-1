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

  it("marca os furos P0 que o fonte ainda contém", () => {
    for (const id of ["F11-MFA-01", "F11-MFA-02", "F11-JWT-01", "F11-JWT-02", "F11-RATE-01"]) {
      assert.equal(byId[id].static, "FAIL", id);
      assert.equal(byId[id].severity, "P0");
      assert.ok(byId[id].line > 0, id);
      assert.ok(byId[id].excerpt.length > 0, id);
    }
  });

  it("aponta 500 no QR público quando o token curto vira Error comum", () => {
    assert.equal(byId["F11-QR-02"].static, "FAIL");
  });

  it("reconhece controles que o fonte já fecha, sem tratar isso como prova de deploy", () => {
    for (const id of ["F11-JWT-03", "F11-PERSON-01", "F11-PASTORAL-01", "F11-QR-01", "F11-UP-02", "F11-CSRF-01"]) {
      assert.equal(byId[id].static, "PASS", id);
      assert.equal(byId[id].e2e, "BLOCKED", id);
    }
  });

  it("não promove a candidata enquanto houver FAIL P0", () => {
    const summary = summarize(controls);
    assert.ok(summary.blockers.length >= 5);
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
