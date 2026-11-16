import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { classifyPhaseG } from "./phase-g-contract.mjs";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

test("o inventário de fase G reconhece as capacidades implementadas no fonte", () => {
  const report = classifyPhaseG(root);
  const byId = Object.fromEntries(report.items.map((item) => [item.id, item]));
  for (const id of [
    "schema-vinculo-formal", "api-vinculo-formal", "seed-publicador", "seed-editor",
    "menu-por-papel", "tesouraria-sem-engano", "meu-espaco-agenda", "ficha-controle-no-fonte",
  ]) {
    assert.equal(byId[id]?.status, "PASS", id);
  }
});
