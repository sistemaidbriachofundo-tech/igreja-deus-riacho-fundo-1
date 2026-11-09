import assert from "node:assert/strict";
import test from "node:test";
import { countVerdicts, mergeRows, redact, renderMatrix, type MatrixRow } from "./matrix";

const sample: MatrixRow[] = [
  {
    id: "b",
    persona: "SECRETARIA",
    journey: "abrir ficha",
    status: "FAIL",
    detail: "Bearer abc.def.ghi não abriu",
    durationMs: 12.4,
  },
  {
    id: "a",
    persona: "PUBLICACAO",
    journey: "gate",
    status: "PASS",
    detail: "tela de login",
  },
  {
    id: "b",
    persona: "SECRETARIA",
    journey: "abrir ficha",
    status: "FAIL",
    detail: "controle ausente",
  },
];

test("redige jwt e bearer e deduplica pelo id", () => {
  const rows = mergeRows(sample);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.id, "a");
  assert.equal(rows[1]?.detail, "controle ausente");
  assert.equal(redact("Authorization: Bearer eyJaaa.bbb.ccc"), "Authorization: Bearer [redigido]");
  assert.equal(countVerdicts(rows).FAIL, 1);
  assert.match(renderMatrix(rows, "2026-11-09"), /FAIL/);
  assert.doesNotMatch(renderMatrix(sample, "2026-11-09"), /eyJ/);
});
