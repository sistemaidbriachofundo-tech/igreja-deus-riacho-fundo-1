import { expect, type Page, type TestInfo } from "@playwright/test";
import { record } from "./journal";
import type { MatrixRow, Verdict } from "./matrix";

export function keep(row: MatrixRow, bucket: MatrixRow[]): void {
  record(row);
  bucket.push(row);
}

export function finish(bucket: MatrixRow[]): void {
  const failed = bucket.filter((row) => row.status === "FAIL").map((row) => `${row.id}: ${row.detail}`);
  expect(failed, failed.join("\n")).toEqual([]);
}

export function row(
  id: string,
  persona: MatrixRow["persona"],
  journey: string,
  status: Verdict,
  detail: string,
  extra?: Pick<MatrixRow, "evidence" | "durationMs">,
): MatrixRow {
  return { id, persona, journey, status, detail, ...extra };
}

export async function requireWeb(page: Page, testInfo: TestInfo, persona: MatrixRow["persona"], id: string): Promise<boolean> {
  try {
    const response = await page.request.get(testInfo.project.use.baseURL ?? "/", { timeout: 8_000 });
    if (response.status() < 500) return true;
  } catch {
    /* servidor ausente */
  }
  const detail = `Servidor ${testInfo.project.name} indisponível em ${testInfo.project.use.baseURL}.`;
  record(row(id, persona, "disponibilidade do servidor", process.env.QA_REQUIRE_STACK === "1" ? "FAIL" : "BLOCKED", detail));
  if (process.env.QA_REQUIRE_STACK === "1") {
    expect(false, detail).toBe(true);
  }
  return false;
}
