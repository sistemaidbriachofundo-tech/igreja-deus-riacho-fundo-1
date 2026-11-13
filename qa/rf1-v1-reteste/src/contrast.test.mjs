import assert from "node:assert/strict";
import test from "node:test";
import { contrastRatio } from "./contrast.mjs";

test("o par antigo da legenda fica abaixo de 4,5:1", () => {
  const ratio = contrastRatio("#E3DFD0", "#CFB58D");
  assert.ok(ratio < 1.6);
  assert.ok(ratio > 1.3);
});

test("branco sobre #101f1f passa de 4,5:1", () => {
  const ratio = contrastRatio("#ffffff", "#101f1f");
  assert.ok(ratio >= 4.5);
  assert.ok(Math.abs(ratio - 16.97) < 0.05);
});
