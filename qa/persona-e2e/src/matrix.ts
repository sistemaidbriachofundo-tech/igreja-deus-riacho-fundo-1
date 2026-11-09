export type Verdict = "PASS" | "FAIL" | "BLOCKED";

export type Persona =
  | "SECRETARIA"
  | "PASTOR"
  | "TESOURARIA"
  | "LIDER"
  | "MEMBRO"
  | "EDITOR"
  | "ADMIN"
  | "PUBLICACAO"
  | "PLATAFORMA";

export type MatrixRow = {
  id: string;
  persona: Persona;
  journey: string;
  status: Verdict;
  detail: string;
  evidence?: string;
  durationMs?: number;
};

const PERSONA_ORDER: Persona[] = [
  "PUBLICACAO",
  "PLATAFORMA",
  "SECRETARIA",
  "PASTOR",
  "TESOURARIA",
  "LIDER",
  "MEMBRO",
  "EDITOR",
  "ADMIN",
];

export function redact(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, "Bearer [redigido]")
    .replace(/eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/g, "[jwt-redigido]")
    .replace(/(password|senha|token|authorization)(["']?\s*[:=]\s*["'])[^"']+/gi, "$1$2[redigido]");
}

export function normalizeRow(row: MatrixRow): MatrixRow {
  const detail = redact(row.detail).slice(0, 500);
  const evidence = row.evidence ? redact(row.evidence) : undefined;
  const durationMs =
    typeof row.durationMs === "number" && Number.isFinite(row.durationMs)
      ? Math.max(0, Math.round(row.durationMs))
      : undefined;
  return { ...row, detail, evidence, durationMs };
}

export function mergeRows(rows: MatrixRow[]): MatrixRow[] {
  const byId = new Map<string, MatrixRow>();
  for (const row of rows) {
    byId.set(row.id, normalizeRow(row));
  }
  return [...byId.values()].sort((a, b) => {
    const persona = PERSONA_ORDER.indexOf(a.persona) - PERSONA_ORDER.indexOf(b.persona);
    if (persona !== 0) return persona;
    return a.id.localeCompare(b.id);
  });
}

export function countVerdicts(rows: MatrixRow[]): Record<Verdict, number> {
  return rows.reduce(
    (acc, row) => {
      acc[row.status] += 1;
      return acc;
    },
    { PASS: 0, FAIL: 0, BLOCKED: 0 },
  );
}

export function renderMatrix(rows: MatrixRow[], generatedAt: string): string {
  const merged = mergeRows(rows);
  const counts = countVerdicts(merged);
  const lines = [
    "# Matriz QA E2E por persona",
    "",
    `Gerada em ${generatedAt}. Contagens: **${counts.PASS} PASS**, **${counts.FAIL} FAIL**, **${counts.BLOCKED} BLOCKED**.`,
    "",
    "Uma linha PASS em tela de login não conta como módulo operacional. Jornadas que só encontraram o gate ficam FAIL ou BLOCKED, com o motivo explícito.",
    "",
    "| Persona | Jornada | Resultado | ms | Detalhe |",
    "|---|---|---|---:|---|",
  ];
  for (const row of merged) {
    const detail = row.detail.replace(/\|/g, "/").replace(/\n/g, " ");
    const evidence = row.evidence ? ` Evidência: \`${row.evidence}\`.` : "";
    lines.push(
      `| ${row.persona} | ${row.journey} | ${row.status} | ${row.durationMs ?? "—"} | ${detail}${evidence} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}
