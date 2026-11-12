import { summarize } from "./static-scan.mjs";

export const PERSONAS = [
  {
    id: "admin",
    role: "PLATFORM_ADMIN",
    email: "platform.demo@example.test",
    seeded: true,
    mfaExpected: "obrigatório quando a frente A entrar",
  },
  {
    id: "secretaria",
    role: "SECRETARIA",
    email: "ana.demo@example.test",
    seeded: true,
    mfaExpected: "obrigatório quando a frente A entrar",
  },
  {
    id: "pastor",
    role: "PASTOR",
    email: "pastor.demo@example.test",
    seeded: true,
    mfaExpected: "obrigatório quando a frente A entrar",
  },
  {
    id: "tesouraria",
    role: "TESOURARIA",
    email: "tesouraria.demo@example.test",
    seeded: true,
    mfaExpected: "obrigatório quando a frente A entrar",
  },
  {
    id: "lider",
    role: "LIDER_MINISTERIO",
    email: "lider.jovens.demo@example.test",
    seeded: true,
    mfaExpected: "confirmar com o integrador se o líder entra no conjunto privilegiado",
  },
  {
    id: "membro",
    role: "MEMBRO",
    email: "bruno.demo@example.test",
    seeded: true,
    mfaExpected: "login com senha deve continuar sem trancar a conta sintética",
  },
  {
    id: "editor",
    role: "EDITOR_SITE",
    email: "editor.demo@example.test",
    seeded: true,
    mfaExpected: "hoje o controller de MFA não lista este papel; o reteste prova cadastro ou exclusão explícita",
  },
  {
    id: "publicador",
    role: "PUBLICADOR_SITE",
    email: "publicador.demo@example.test",
    seeded: false,
    mfaExpected: "não há usuário no seed; o roteiro fica bloqueado até existir conta fictícia",
  },
];

export function renderDocs({
  headSha,
  candidateSha,
  generatedAt,
  controls,
  http,
  cve,
  fronts,
}) {
  const summary = summarize(controls);
  const release = summary.blockers.length === 0 && http?.shaMatchesCandidate
    ? "SEM P0 ESTÁTICO"
    : "NAO LIBERAR";
  return {
    readme: renderReadme({ headSha, candidateSha, generatedAt, release }),
    matriz: renderMatriz({ headSha, candidateSha, generatedAt, controls, summary, http, release }),
    ameacas: renderThreats(controls),
    cves: renderCves(cve),
    reteste: renderRetest(),
    checklist: renderChecklist({ summary, http, fronts, candidateSha, headSha, release }),
    fronts: renderFronts(fronts, candidateSha),
    machine: {
      generatedAt,
      headSha,
      candidateSha,
      release,
      summary,
      controls,
      http: http ?? { executed: false },
      cve: {
        counts: cve?.counts ?? {},
        rows: cve?.rows ?? [],
      },
      fronts,
      personas: PERSONAS,
    },
  };
}

function renderReadme({ headSha, candidateSha, generatedAt, release }) {
  return `# QA de segurança F1.1-D

Auditoria independente da candidata V1. Esta pasta é a leitura humana. Os testes estão em \`qa/security-f11\`.

- Candidata exigida: \`${candidateSha}\`
- SHA desta árvore na coleta: \`${headSha}\`
- Coleta: ${generatedAt}
- Decisão: **${release}**

A análise estática mostra o que o fonte faz. Ela não prova o deploy. O HTTP só entra como prova do SHA candidato quando \`/meta.sourceSha\` é exatamente esse commit. Homologação de outro commit fica registrada à parte.

Não há segredo, senha, token nem dado de produção nestes relatórios.
`;
}

function renderMatriz({ headSha, candidateSha, generatedAt, controls, summary, http, release }) {
  const lines = [
    "# Matriz F1.1-D",
    "",
    `- Decisão: **${release}**`,
    `- SHA da árvore: \`${headSha}\``,
    `- SHA candidato: \`${candidateSha}\``,
    `- Coleta: ${generatedAt}`,
    `- Estático: ${summary.counts.PASS ?? 0} PASS, ${summary.counts.FAIL ?? 0} FAIL, ${summary.counts.BLOCKED ?? 0} BLOCKED`,
    `- E2E de deploy nesta matriz estática: ${summary.e2e.BLOCKED ?? 0} BLOCKED. Nenhum PASS estático autoriza produção.`,
    "",
    httpSection(http),
    "",
    "| ID | Sev. | Superfície | Estático | E2E deploy | Evidência |",
    "| --- | --- | --- | --- | --- | --- |",
  ];
  for (const item of controls) {
    const where = item.line ? `\`${item.file}:${item.line}\`` : `\`${item.file}\``;
    lines.push(`| ${item.id} | ${item.severity} | ${item.surface} | ${item.static} | ${item.e2e} | ${where} |`);
  }
  lines.push("", "## Leitura de cada controle", "");
  for (const item of controls) {
    lines.push(`### ${item.id} — ${item.static}`);
    lines.push("");
    lines.push(item.title);
    lines.push("");
    lines.push(item.detail);
    lines.push("");
    if (item.excerpt) lines.push(`Trecho: \`${item.excerpt}\``);
    lines.push("");
    lines.push(item.e2eDetail);
    lines.push("");
  }
  return lines.join("\n");
}

function httpSection(http) {
  if (!http?.executed) {
    return [
      "## HTTP",
      "",
      "BLOCKED. A coleta não chamou origem nenhuma. O harness existe e os testes dele usam um duplo local, o que não é prova de deploy.",
    ].join("\n");
  }
  const proof = http.shaMatchesCandidate
    ? "O sourceSha da origem é o SHA candidato. Os resultados abaixo valem como prova desse deploy."
    : `O sourceSha da origem é \`${http.sourceSha ?? "ausente"}\`, diferente do candidato. Os status abaixo descrevem essa origem e não aceitam o SHA candidato.`;
  const rows = (http.results ?? []).map((item) => {
    const note = (item.notes ?? []).join("; ");
    return `| ${item.id} | ${item.method} ${item.path} | ${item.status} | ${item.verdict} | ${note || "—"} |`;
  });
  const lines = [
    "## HTTP da origem allowlist",
    "",
    `- Origem: ${http.origin}`,
    `- ${proof}`,
    `- Abortado: ${http.aborted ? "sim" : "não"}`,
  ];
  if (http.reason) lines.push(`- Motivo: ${http.reason}`);
  if (http.login) {
    lines.push(`- Comparação das duas falhas sintéticas: ${http.login.verdict}. ${http.login.detail}`);
  }
  lines.push(
    "",
    "| ID | Pedido | Status | Veredito | Nota |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
  );
  return lines.join("\n");
}

function renderThreats(controls) {
  const fails = controls.filter((item) => item.static === "FAIL");
  const lines = [
    "# Ameaças confirmadas no fonte",
    "",
    "Cada item abaixo foi lido no SHA candidato. O passo seguinte é correção nas frentes A, B, C e E, com reteste desta suíte. Esta frente não altera esses módulos.",
    "",
  ];
  for (const item of fails) {
    lines.push(`## ${item.id} (${item.severity})`);
    lines.push("");
    lines.push(item.title);
    lines.push("");
    lines.push(item.detail);
    lines.push("");
    lines.push(`Evidência: \`${item.file}:${item.line ?? "?"}\`.`);
    lines.push("");
  }
  return lines.join("\n");
}

function renderCves(cve) {
  const counts = cve?.counts ?? {};
  const lines = [
    "# Dependências",
    "",
    `\`npm audit --omit=dev\` neste lockfile: ${counts.high ?? "?"} altos, ${counts.moderate ?? "?"} moderado(s), ${counts.critical ?? 0} crítico(s).`,
    "",
    "O mesmo comando com `--omit=optional` tira o CLI Prisma e o deepmerge, que o lockfile marca como `devOptional`. O que permanece no grafo de runtime é a cadeia `@vercel/blob` → `@vercel/oidc` → `@vercel/cli-config` → `zod@4.1.11`, mais `next@15.5.29` → `postcss@8.4.31`.",
    "",
    "Nenhum upgrade foi aplicado. A recomendação só vale depois de teste na frente dona do pacote.",
    "",
    "| Pacote | Versão no lock | Severidade | Entra no processo que atende pedido? | Aviso |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const row of cve?.rows ?? []) {
    const advice = row.advisories?.map((item) => item.url || item.title).filter(Boolean).join("<br>") || "—";
    lines.push(`| ${row.name} | ${row.version ?? "—"} | ${row.severity} | ${row.reachable ? "sim" : "não"} | ${advice} |`);
  }
  lines.push("", "## Efeito e correção proposta", "");
  for (const row of cve?.rows ?? []) {
    lines.push(`### ${row.name}`);
    lines.push("");
    lines.push(row.impact);
    lines.push("");
    lines.push(row.recommendation);
    lines.push("");
  }
  return lines.join("\n");
}

function renderRetest() {
  const lines = [
    "# Roteiro de reteste dos perfis V1",
    "",
    "Rodar só depois que a frente A publicar o desafio MFA, numa API cujo `/meta.sourceSha` seja o commit integrado. Usar a senha do seed sintético pela variável de ambiente já adotada no QA, sem gravá-la no relatório. Uma tentativa por perfil. Sem reset, sem mensagem e sem carga.",
    "",
    "Para cada perfil abaixo:",
    "",
    "1. `POST /auth/login` com o e-mail fictício e senha errada. Esperar 401 e a mesma mensagem das outras falhas.",
    "2. `POST /auth/login` com a senha sintética certa. Perfil privilegiado deve receber desafio opaco e não um access token. Perfil comum deve receber sessão só se o integrador tiver deixado esse papel fora do MFA.",
    "3. Repetir o código TOTP correto. O segundo uso do mesmo código deve falhar.",
    "4. Chamar `POST /auth/refresh` e `POST /auth/switch-church` com o token pré-MFA, se a senha ainda devolver algum. Esperar 401.",
    "5. Depois do logout, repetir o access token antigo em `GET /auth/me`. Esperar 401.",
    "6. Trocar o papel da conta sintética e repetir o token anterior. Esperar 401 ou 403, nunca o papel antigo.",
    "",
    "| Perfil | Papel | E-mail fictício | No seed | MFA esperado |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const persona of PERSONAS) {
    lines.push(`| ${persona.id} | ${persona.role} | ${persona.email} | ${persona.seeded ? "sim" : "não"} | ${persona.mfaExpected} |`);
  }
  lines.push("");
  lines.push("O publicador não tem conta no seed. Enquanto isso, o reteste desse perfil fica BLOCKED. Criar a conta é trabalho de seed, fora desta frente.");
  lines.push("");
  lines.push("Contas privilegiadas da lista: admin, secretaria, pastor e tesouraria. Líder, editor e publicador precisam de decisão explícita do integrador antes de serem cobrados como MFA obrigatório. Membro não pode perder o login por um desafio que o controller atual nem oferece a todos os papéis.");
  lines.push("");
  lines.push("Estado nesta coleta: **BLOCKED**. A frente A não está na árvore e nenhuma senha foi usada.");
  return lines.join("\n");
}

function renderChecklist({ summary, http, fronts, candidateSha, headSha, release }) {
  const same = headSha === candidateSha;
  return `# Checklist liberatório

Decisão desta coleta: **${release}**.

| Porta | Estado | Por quê |
| --- | --- | --- |
| Árvore é o SHA candidato | ${same ? "PASS" : "FAIL"} | ${same ? "HEAD igual à candidata." : "HEAD divergiu. Encaminhar ao integrador."} |
| MFA bloqueia JWT privilegiado | FAIL | F11-MFA-01 e F11-MFA-02. |
| Sessão revogável | FAIL | F11-JWT-01 e F11-JWT-02. |
| Limite não forjável e compartilhado | FAIL | F11-RATE-01 e F11-RATE-02. |
| E2E autenticado no deploy deste SHA | BLOCKED | ${http?.shaMatchesCandidate ? "A origem bate com o SHA, mas o roteiro autenticado não rodou." : "A origem consultada anunciou " + (http?.sourceSha ?? "sem SHA") + ". O roteiro autenticado não rodou."} |
| Frentes A, B e C integradas | ${fronts.integrated ? "PASS" : "BLOCKED"} | ${fronts.summary} |
| CI desta branch | BLOCKED | O workflow atual dispara em pull request para \`main\`. Esta frente não edita workflow. O PR contra \`previa/rf1-v1\` não herda esse job. |
| \`npm audit --omit=dev\` limpo | FAIL | ${summary.counts.FAIL} controles de código em FAIL; o audit segue com altos no lockfile. Ver \`cves.md\`. |
| Pronto para produção | FAIL | A própria issue da fase diz que nada está pronto antes de MFA real, sessão revogável, limite compatível com escala e E2E autenticado. |

P0 estáticos em aberto: ${summary.blockers.map((item) => item.id).join(", ") || "nenhum"}.
`;
}

function renderFronts(fronts, candidateSha) {
  const lines = [
    "# Frentes A, B e C",
    "",
    `Base exigida: \`${candidateSha}\`. Esta frente não edita auth, auditoria nem observabilidade.`,
    "",
    fronts.summary,
    "",
    "| Frente | Issue | Dono | O que o QA precisa retestar | Estado na coleta |",
    "| --- | --- | --- | --- | --- |",
    "| A | #185 | `apps/api/src/auth/**` | Login sem JWT pleno, replay, refresh, logout, grant alterado | " + (fronts.branches.A ?? "ausente") + " |",
    "| B | #186 | `apps/api/src/audit/**` | Metadado recusado na escrita, leitura por papel, trilha preservada | " + (fronts.branches.B ?? "ausente") + " |",
    "| C | #187 | `apps/api/src/common/observability/**` | requestId, log sem segredo, 429 com IP de proxy confiável | " + (fronts.branches.C ?? "ausente") + " |",
    "",
    "Quando um PR dessas frentes existir, o reteste desta suíte compara o diff com os IDs FAIL. Teste unitário da frente dona não vira PASS de deploy.",
    "",
  ];
  return lines.join("\n");
}
