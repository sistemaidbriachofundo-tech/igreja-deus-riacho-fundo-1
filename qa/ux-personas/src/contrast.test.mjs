import assert from "node:assert/strict";
import test from "node:test";
import { contrastMinimum, contrastRatio, isLargeText } from "./contrast.mjs";

test("marrom sobre creme passa e ouro sobre creme não passa", () => {
  const brownOnCream = contrastRatio("#4A2612", "#F7EDE0");
  const goldOnCream = contrastRatio("#D4AF37", "#F7EDE0");
  assert.ok(brownOnCream >= 4.5, String(brownOnCream));
  assert.ok(goldOnCream < 3, String(goldOnCream));
});

test("texto grande usa limiar 3 e texto comum usa 4,5", () => {
  assert.equal(isLargeText(24, 400), true);
  assert.equal(isLargeText(18, 700), false);
  assert.equal(isLargeText(19, 700), true);
  assert.equal(contrastMinimum(16, 400), 4.5);
  assert.equal(contrastMinimum(32, 500), 3);
});
