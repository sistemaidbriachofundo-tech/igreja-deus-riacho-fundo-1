import { countVerdicts, normalizeRow, releaseDecision } from "./verdict.mjs";

function cell(value) {
  return String(value ?? "").replace(/\|/g, "/").replace(/\n/g, " ");
}

export function renderMatrix(rows, meta) {
  const normalized = rows.map(normalizeRow);
  const counts = countVerdicts(normalized);
  const decision = releaseDecision(normalized);
  const lines = [
    "# Matriz QA v3 — frente I",
    "",
    `Executada em ${meta.generatedAt}.`,
    "",
    `- Site: ${meta.pagesUrl}`,
    `- API: ${meta.apiUrl}`,
    `- SHA do Pages (\`release.json\`): \`${meta.pagesSha || "ausente"}\``,
    `- SHA da API (\`/meta\`): \`${meta.apiSha || "ausente"}\``,
    `- SHA do git desta branch: \`${meta.gitSha}\``,
    `- Decisão para o integrador J (#154): **${decision.label}**. ${decision.reason}`,
    "",
    `Contagens: **${counts.PASS} PASS**, **${counts.FAIL} FAIL**, **${counts.BLOCKED} BLOCKED**.`,
    "",
    "PASS só entra quando o passo foi executado de verdade. 404 ou 501 visível no modo usuário permanece FAIL. Jornada sem sessão ou sem a senha HML fica BLOCKED, não PASS.",
    "",
    "| ID | Resultado | Severidade | Item | Evidência |",
    "|---|---|---|---|---|",
  ];
  for (const row of normalized) {
    const evidence = row.evidence ? `\`${row.evidence}\`` : "—";
    lines.push(`| ${row.id} | ${row.status} | ${row.severity ?? "—"} | ${cell(row.title)}. ${cell(row.detail)} | ${evidence} |`);
  }
  lines.push("");
  return lines.join("\n");
}

export function renderFindings(rows, meta) {
  const normalized = rows.map(normalizeRow);
  const decision = releaseDecision(normalized);
  const hot = normalized.filter((row) => row.status === "FAIL" || (row.status === "BLOCKED" && row.critical));
  const lines = [
    "# Achados para o integrador J (#154)",
    "",
    `Issue de QA: #153. Epic: #144. Site: ${meta.pagesUrl}. SHA Pages \`${meta.pagesSha || "ausente"}\`. SHA API \`${meta.apiSha || "ausente"}\`.`,
    "",
    `**${decision.label}.** ${decision.reason}`,
    "",
    "Esta frente não altera produto. Os itens abaixo são para J corrigir ou desbloquear. Nenhum merge e nenhum deploy foram feitos por I.",
    "",
  ];
  if (hot.length === 0) {
    lines.push("Nenhum FAIL e nenhum BLOCKED crítico nesta execução.");
  }
  for (const row of hot) {
    lines.push(`## ${row.id} — ${row.status}${row.severity ? ` ${row.severity}` : ""}`);
    lines.push("");
    lines.push(row.title);
    lines.push("");
    lines.push(row.detail);
    lines.push("");
    if (row.steps) lines.push(`Passos: ${row.steps}`);
    if (row.evidence) lines.push(`Evidência: \`${row.evidence}\`.`);
    lines.push("");
  }
  return lines.join("\n");
}

export function renderRoutes(routes) {
  const lines = [
    "# Rotas observadas sem sessão",
    "",
    "| Rota | HTTP | Gate de acesso | Pessoas listadas | Jargão | Vazamento 404/501 |",
    "|---|---:|---|---|---|---|",
  ];
  for (const route of routes) {
    lines.push(
      `| ${route.path} | ${route.http} | ${route.gate ? "sim" : "não"} | ${route.people ? "sim" : "não"} | ${route.jargon.join(", ") || "—"} | ${route.leaks.join(", ") || "—"} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}
