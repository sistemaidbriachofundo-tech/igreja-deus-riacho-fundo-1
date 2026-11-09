import fs from "node:fs";
import path from "node:path";
import { mergeRows, renderMatrix, type MatrixRow } from "./matrix";

export const reportsDir = path.resolve(import.meta.dirname, "../reports");
export const journalPath = path.join(reportsDir, "journal.jsonl");
export const matrixJsonPath = path.join(reportsDir, "matriz.json");
export const matrixMdPath = path.join(reportsDir, "matriz.md");

export function resetJournal(): void {
  fs.mkdirSync(reportsDir, { recursive: true });
  fs.writeFileSync(journalPath, "");
}

export function record(row: MatrixRow): MatrixRow {
  fs.mkdirSync(reportsDir, { recursive: true });
  fs.appendFileSync(journalPath, `${JSON.stringify(row)}\n`);
  return row;
}

export function readJournal(): MatrixRow[] {
  if (!fs.existsSync(journalPath)) return [];
  return fs
    .readFileSync(journalPath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as MatrixRow);
}

export function writeMatrixFiles(): MatrixRow[] {
  const rows = mergeRows(readJournal());
  const generatedAt = new Date().toISOString();
  fs.mkdirSync(reportsDir, { recursive: true });
  fs.writeFileSync(
    matrixJsonPath,
    `${JSON.stringify({ generatedAt, rows }, null, 2)}\n`,
  );
  fs.writeFileSync(matrixMdPath, renderMatrix(rows, generatedAt));
  return rows;
}
