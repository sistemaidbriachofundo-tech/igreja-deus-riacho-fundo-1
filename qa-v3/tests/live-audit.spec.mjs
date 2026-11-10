import { test, expect } from "@playwright/test";
import { runAudit } from "../src/run-live.mjs";

test("auditoria externa no Pages e na API HML", async ({ browser }) => {
  test.skip(process.env.QA_RUN_EXTERNAL !== "1", "Defina QA_RUN_EXTERNAL=1 para consultar a URL oficial.");
  test.setTimeout(15 * 60 * 1000);
  const result = await runAudit(browser);
  expect(result.complete, result.missing?.join(",")).toBe(true);
  expect(result.rows.every((row) => ["PASS", "FAIL", "BLOCKED"].includes(row.status))).toBe(true);
  expect(result.rows.some((row) => row.detail.includes("runner não classificou"))).toBe(false);
});
