import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { classifyAlias, classifyDeploymentRead, counts, assertNoAccessMarkedAsProductFailure, SHA } from "./classify.mjs";
import { COMPARED_IDS, rows } from "./rows.mjs";

const probe = {
  status: 302,
  location: "https://vercel.com/sso-api?url=https%3A%2F%2Fid-riacho1-web-hml.vercel.app%2F&nonce=omitido",
  body: "Protected by Vercel Authentication",
};

test("o alias em SSO fica bloqueado por acesso e não vira FAIL", () => {
  const verdict = classifyAlias(probe);
  assert.equal(verdict.result, "BLOCKED");
  assert.equal(verdict.kind, "acesso");
});

test("token ausente não confirma READY e não é falha de produto", () => {
  const verdict = classifyDeploymentRead({ status: 403, missingToken: true });
  assert.equal(verdict.result, "BLOCKED");
  assert.equal(verdict.kind, "acesso");
  assert.match(classifyDeploymentRead({ readyState: "READY" }).detail, /não comprova jornada/);
});

test("a matriz compara os 22 itens da #174 e não marca acesso como FAIL", () => {
  assert.deepEqual(rows.map(row => row.id), COMPARED_IDS);
  assert.equal(rows.length, 22);
  assert.deepEqual(assertNoAccessMarkedAsProductFailure(rows), []);
  assert.deepEqual(counts(rows), { PASS: 0, FAIL: 3, BLOCKED: 19 });
  assert.deepEqual(
    rows.filter(row => row.result === "FAIL").map(row => row.id),
    ["RF1-PES-CTA", "RF1-LIMPEZA", "RF1-CRD-409"],
  );
});

test("nenhuma linha PASS de jornada da prévia entra nesta rodada", () => {
  assert.equal(rows.some(row => row.result === "PASS"), false);
  assert.equal(SHA, "935fd53e8187b840084a845e418dcb06cbd13956");
  const published = readFileSync(new URL("../reports/matriz.md", import.meta.url), "utf8");
  assert.match(published, /\*\*0 PASS\*\*, \*\*3 FAIL\*\*, \*\*19 BLOCKED\*\*/);
  assert.match(published, /935fd53e8187b840084a845e418dcb06cbd13956/);
});
