/** Regras puras do veredito. 404/501 visível nunca permanece PASS. */

export function redact(value) {
  return String(value ?? "")
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, "Bearer [redigido]")
    .replace(/eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/g, "[jwt-redigido]")
    .replace(/(password|senha|token|authorization|secret)(["']?\s*[:=]\s*["'])[^"'\s]+/gi, "$1$2[redigido]")
    .replace(/\bqa-recusada\b/gi, "[senha-de-prova]");
}

const JARGON = [
  { id: "demo", re: /\bdemo\b|demonstra(?:ção|cao)\b/i },
  { id: "roster", re: /\broster\b/i },
  { id: "endpoint", re: /\bendpoint\b/i },
  { id: "schema", re: /\bschema\b/i },
  { id: "mock", re: /\bmock\b/i },
  { id: "fase-1", re: /fase\s*1/i },
  { id: "stack", re: /\b(postgresql|nestjs|localstorage)\b/i },
];

export function jargonHits(text) {
  const source = String(text ?? "");
  return JARGON.filter((item) => item.re.test(source)).map((item) => item.id);
}

export function userModeHttpLeak(text) {
  const source = String(text ?? "");
  const hits = [];
  if (/\b501\b/.test(source)) hits.push("501");
  if (/\b404\b/.test(source)) hits.push("404");
  if (/\bBLOCKED\b/.test(source)) hits.push("BLOCKED");
  return hits;
}

export function applyUserModeRule(row, visibleText) {
  const leaks = userModeHttpLeak(visibleText);
  if (row.status === "PASS" && leaks.length > 0) {
    return {
      ...row,
      status: "FAIL",
      severity: "P1",
      detail: redact(`${row.detail} Texto visível ao usuário contém ${leaks.join(", ")}.`),
    };
  }
  return { ...row, detail: redact(row.detail) };
}

export function publicNavVerdict(labels) {
  const expected = ["Início", "Quem somos", "Agenda", "Login"];
  const normalized = labels.map((label) => label.replace(/\s+/g, " ").trim()).filter(Boolean);
  const missing = expected.filter((label) => !normalized.some((item) => item.toLowerCase() === label.toLowerCase()));
  const extra = normalized.filter((label) => !expected.some((item) => item.toLowerCase() === label.toLowerCase()));
  if (missing.length === 0 && extra.length === 0) {
    return { status: "PASS", severity: null, detail: "O menu público mostra só Início, Quem somos, Agenda e Login." };
  }
  return {
    status: "FAIL",
    severity: "P1",
    detail: `Menu público divergente. Ausentes: ${missing.join(", ") || "nenhum"}. Extra: ${extra.join(", ") || "nenhum"}.`,
  };
}

export function anonymousStatusVerdict(results) {
  const open = results.filter((item) => item.status >= 200 && item.status < 300);
  const wrong = results.filter((item) => item.status !== 401);
  if (wrong.length === 0 && results.length > 0) {
    return {
      status: "PASS",
      severity: null,
      detail: `${results.length} rotas protegidas responderam 401 sem sessão.`,
    };
  }
  if (open.length > 0) {
    return {
      status: "FAIL",
      severity: "P0",
      detail: `Acesso anônimo aceito em ${open.map((item) => `${item.path} (${item.status})`).join("; ")}.`,
    };
  }
  return {
    status: "FAIL",
    severity: "P1",
    detail: `Resposta inesperada sem sessão: ${wrong.map((item) => `${item.path} (${item.status})`).join("; ")}.`,
  };
}

export function treasuryPresentation(text) {
  const source = String(text ?? "");
  const illustration = /ilustração do contrato/i.test(source);
  const money = /R\$\s*\d/.test(source);
  const noQuery = /sem consulta/i.test(source);
  if (illustration && money && noQuery) {
    return {
      status: "FAIL",
      severity: "P1",
      detail: "A tesouraria sem sessão mostra valores em reais na ilustração enquanto as medidas da API dizem Sem consulta.",
    };
  }
  if (/sem consulta/i.test(source) && !money) {
    return { status: "PASS", severity: null, detail: "Sem sessão a tesouraria não inventa valor." };
  }
  return { status: "BLOCKED", severity: null, detail: "A leitura da tesouraria não trouxe o contrato esperado de números." };
}

export function releaseDecision(rows) {
  const fails = rows.filter((row) => row.status === "FAIL");
  const p0 = fails.filter((row) => row.severity === "P0");
  const p1 = fails.filter((row) => row.severity === "P1");
  const blockedCritical = rows.filter((row) => row.status === "BLOCKED" && row.critical);
  if (p0.length || p1.length || blockedCritical.length) {
    return {
      approved: false,
      label: "NÃO APROVADA",
      reason: `${p0.length} FAIL P0, ${p1.length} FAIL P1, ${blockedCritical.length} BLOCKED críticos. A release não segue para homologação humana como pronta.`,
    };
  }
  const blocked = rows.filter((row) => row.status === "BLOCKED");
  if (blocked.length) {
    return {
      approved: false,
      label: "NÃO APROVADA",
      reason: `${blocked.length} itens BLOCKED sem falha crítica. Ainda não há execução completa.`,
    };
  }
  if (fails.length) {
    return {
      approved: false,
      label: "NÃO APROVADA",
      reason: `${fails.length} FAIL abaixo de P1. A frente I não aprova a release.`,
    };
  }
  return { approved: true, label: "SEM PENDÊNCIA DESTA FRENTE", reason: "Todos os itens do catálogo passaram nesta execução." };
}

export function countVerdicts(rows) {
  return rows.reduce(
    (acc, row) => {
      acc[row.status] = (acc[row.status] ?? 0) + 1;
      return acc;
    },
    { PASS: 0, FAIL: 0, BLOCKED: 0 },
  );
}

export function missingChecks(checks, rows) {
  const present = new Set(rows.map((row) => row.id));
  return checks.filter((check) => !present.has(check.id)).map((check) => check.id);
}

export function normalizeRow(row) {
  return {
    id: row.id,
    group: row.group,
    title: row.title,
    status: row.status,
    severity: row.severity ?? null,
    critical: Boolean(row.critical),
    detail: redact(row.detail).replace(/\s+/g, " ").trim().slice(0, 700),
    evidence: row.evidence ? redact(row.evidence) : "",
    steps: redact(row.steps ?? "").replace(/\s+/g, " ").trim().slice(0, 500),
  };
}
