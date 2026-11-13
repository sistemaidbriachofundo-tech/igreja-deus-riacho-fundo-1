import { PRIOR_QA } from "./judge.mjs";

function cell(value) {
  return String(value ?? "").replaceAll("|", "/").replaceAll("\n", " ");
}

export function renderMatrix(report) {
  const counts = report.summary;
  const lines = [
    "# Matriz RF1/V1-C — auditoria independente",
    "",
    `Executada em ${report.executedAt}.`,
    "",
    `- Site medido: ${report.pagesUrl}`,
    `- API: ${report.apiUrl}`,
    `- SHA do Pages: \`${report.pagesSha ?? "ausente"}\``,
    `- SHA da API: \`${report.apiSha ?? "null"}\``,
    `- SHA pedido: \`${report.baseline}\``,
    `- Prévia web HML: ${report.preview?.status ?? "sem resposta"} ${report.preview?.marker ?? ""}`.trim(),
    "",
    "A matriz da issue #153 descreve outro commit. Ela registrou "
      + `${PRIOR_QA.pass} PASS, ${PRIOR_QA.fail} FAIL e ${PRIOR_QA.blocked} BLOCKED em ${PRIOR_QA.executedAt}, `
      + `com Pages \`${PRIOR_QA.pagesSha}\`. Esses números não entram nesta contagem.`,
    "",
    `Contagem desta execução: **${counts.pass} PASS**, **${counts.fail} FAIL**, **${counts.blocked} BLOCKED**.`,
    "",
    "PASS só entra quando o critério foi observado. Jornada sem sessão fica BLOCKED. Nenhum segredo é impresso.",
    "",
    "| ID | Resultado | Prioridade | Janela | Item | Causa | Critério | Evidência |",
    "|---|---|---|---|---|---|---|---|",
  ];
  for (const item of report.rows) {
    lines.push(`| ${cell(item.id)} | ${cell(item.result)} | ${cell(item.priority)} | ${cell(item.window)} | ${cell(item.item)} | ${cell(item.cause)} | ${cell(item.criterion)} | ${cell(item.evidence)} |`);
  }
  lines.push("");
  return lines.join("\n");
}

export function renderInventory(inventory) {
  const lines = [
    "# Inventário de rotas e código — baseline 6c43aea",
    "",
    "Leitura estática do SHA publicado. Nada foi apagado. A exclusão fica com o integrador, depois deste mapa.",
    "",
    "O build de `main` liga `NEXT_PUBLIC_HML_ENABLED` e `NEXT_PUBLIC_RIACHINHO_PUBLIC_ENABLED`. "
      + "Por isso o Pages oficial monta o ramo HML e o chat público. O workflow de CI não é editado nesta frente.",
    "",
    "## Rotas",
    "",
    "| Rota | Classe | Arquivo | Nota |",
    "|---|---|---|---|",
  ];
  for (const route of inventory.routes) {
    lines.push(`| \`${route.route}\` | ${route.classification} | \`${route.file}\` | ${route.note} |`);
  }
  lines.push("", "## Componentes vigiados", "", "| Arquivo | Classe | Quem importa |", "|---|---|---|");
  for (const component of inventory.components) {
    const importers = component.importers.length ? component.importers.join(", ") : "só testes ou referência indireta";
    lines.push(`| \`${component.file}\` | ${component.classification} | ${importers} |`);
  }
  lines.push("", "## Scripts e flag", "", "| Arquivo | Classe | Nota |", "|---|---|---|");
  for (const script of inventory.scripts) {
    lines.push(`| \`${script.file}\` | ${script.classification} | ${script.note} |`);
  }
  lines.push("", "## Sinais para não apagar no escuro", "");
  const flags = inventory.flags;
  const notes = [
    flags.publicAiMounted ? "RiachinhoPublicChat ainda é montado pelo portal público." : null,
    flags.internalAssistant ? "ViviEditorialAssistant permanece em SiteManager e deve ser preservado." : null,
    flags.localStorageFallback ? "use-church-records.ts ainda grava a base ilustrativa em localStorage. MemberDirectory, ChurchSecretary e ChurchDashboard são o ramo falso do build HML; testes de produto ainda citam esses arquivos." : null,
    flags.simulatedRole ? "W1PortalStudio ainda oferece papel simulado e publicação simulada." : null,
    flags.operationLabel ? "O menu ainda tem o rótulo Ministérios e operação." : null,
    flags.meuEspacoInAdminMenu ? "Meu Espaço usa OWN_ASSIGNMENT, que inclui papéis administrativos." : null,
    flags.collapsed409 ? "HmlPhaseOne traduz qualquer 409 para a mesma frase." : null,
  ].filter(Boolean);
  for (const note of notes) lines.push(`- ${note}`);
  lines.push("");
  return lines.join("\n");
}

export function renderRoteiro() {
  return `# Roteiro observável do áudio de 10/11/2026

A transcrição literal não está no repositório. As janelas abaixo são as da issue #171. O texto de cada exigência é o da diretriz substitutiva publicada na #144. Eklesia continua sendo só referência externa.

| Janela | Tela | Exigência observável | IDs |
|---|---|---|---|
| 00:13–01:27 | Home | Início, Quem somos e Agenda numa página com âncoras; login separado; sem assistente público. | RF1-HOME-PAGINA, RF1-HOME-IA, RF1-HOME-EXTRA, RF1-HOME-CONTRASTE, RF1-HOME-SCROLL, RF1-PERF-PUBLICA |
| 01:40–02:06 | Login | Manter o visual aprovado; apagar “Seu acesso é individual”; Sair volta ao destino aprovado. A fala não nomeia esse destino. | RF1-LOGIN-ESTRUTURA, RF1-LOGIN-TEXTO, RF1-LOGIN-ECO, RF1-LOGIN-SAIDA, RF1-AUTH |
| 02:06–03:23 | Admin | Painel premium sem cartão de QA, jargão ou texto de planejamento; corrigir lentidão; barra com perfil, busca, avisos e um Sair. | RF1-ADM-VISUAL, RF1-ADM-LENTIDAO, RF1-ADM-BARRA |
| 03:23–04:38 | Membros e secretaria | Ficha editável e persistente; secretaria distinta; CTAs “Cadastrar pessoa” e “Iniciar admissão”. | RF1-PES-FICHA, RF1-PES-CTA |
| 04:38–05:10 | Credenciais | 409 sem ambiguidade; frente, verso, QR, PDF e revogação. | RF1-CRD-409, RF1-CRD-ABRIR |
| 05:10–06:26 | Ministérios | Acabar com “Ministérios e operação”; o menu abre o catálogo e cada ministério no próprio contexto. | RF1-MIN-SUPERFICIE, RF1-MIN-CONTEXTO |
| 06:26–06:45 | Membro | Visão separada da administração; sem “Meu Espaço” no menu administrativo. | RF1-MBR-MENU |
| 06:45–07:22 | Editor | Redesenhar Mídia/Conteúdo e Gestão do Site; tirar ferramenta técnica, fase, RFC, QA e endpoint; remover o editor simulado. | RF1-EDI-SIMULADO, RF1-EDI-TECNICO, RF1-EDI-INTERNO, RF1-LIMPEZA |

Critério de prévia, fora do relógio do áudio: a regressão da prévia Vercel \`id-riacho1-web-hml\` só conta quando o deployment estiver READY. Enquanto isso, RF1-PREVIEW fica BLOCKED e as capturas são do Pages oficial do mesmo SHA.
`;
}

export function renderPerformance(report) {
  const lines = [
    "# Performance e cascata — baseline publicada",
    "",
    "Medição no browser, Navigation Timing e requests da própria navegação. A prévia Vercel não entrou porque não está READY.",
    "",
    "## Páginas",
    "",
    "| Caminho | HTTP | TTFB (ms) | DOMContentLoaded (ms) | Load (ms) | Requests |",
    "|---|---|---|---|---|---|",
  ];
  for (const item of report.timings ?? []) {
    lines.push(`| \`${item.path}\` | ${item.http} | ${Math.round(item.ttfbMs)} | ${Math.round(item.dclMs)} | ${Math.round(item.loadMs)} | ${item.requests} |`);
  }
  lines.push("", "## Requests mais lentos", "");
  for (const page of report.waterfalls ?? []) {
    lines.push(`### ${page.path}`, "", "| Método | Status | Tipo | Caminho |", "|---|---|---|---|");
    for (const request of page.slowest) {
      lines.push(`| ${request.method} | ${request.status} | ${request.type} | \`${request.path}\` |`);
    }
    lines.push("");
  }
  if (report.authenticatedTiming) {
    lines.push(`Painel autenticado: TTFB ${Math.round(report.authenticatedTiming.ttfbMs)} ms, load ${Math.round(report.authenticatedTiming.loadMs)} ms.`);
  } else {
    lines.push("Painel autenticado: não medido. O login sintético não abriu sessão.");
  }
  lines.push("");
  return lines.join("\n");
}

export function renderChecklist(report) {
  const open = report.rows.filter((item) => item.result !== "PASS");
  const lines = [
    "# Checklist do integrador — RF1/V1-C",
    "",
    "Esta frente não altera tela, API, banco, contrato nem deploy. Os itens abaixo são evidência para quem for integrar.",
    "",
    "- Não reutilizar PASS da #153. Aquela execução leu o SHA 3c7375c.",
    "- Não tratar esta matriz como homologação humana.",
    "- Não apagar o assistente interno de SiteManager junto com o chat público.",
    "- Não apagar MemberDirectory, ChurchSecretary ou ChurchDashboard sem atualizar os testes que ainda exigem o ramo local.",
    "- Não imprimir senha, token ou corpo de /auth/login em PR ou comentário.",
    "- Repetir a suíte quando a prévia `id-riacho1-web-hml` estiver READY: `QA_RUN_EXTERNAL=1 QA_PAGES_URL=<prévia> npm run audit` dentro de `qa/rf1-v1c`.",
    "- A senha HML, se existir, entra só por `QA_DEMO_PASSWORD` no ambiente local. Não versionar.",
    "",
    "## Itens abertos",
    "",
    "| ID | Resultado | Prioridade | O que a evidência mostra |",
    "|---|---|---|---|",
  ];
  for (const item of open) {
    lines.push(`| ${item.id} | ${item.result} | ${item.priority} | ${item.cause} |`);
  }
  lines.push("");
  return lines.join("\n");
}

export function renderReadme(report) {
  return `# QA RF1/V1-C

Auditoria independente da issue #171 sobre a baseline \`${report.baseline}\`. Os relatórios desta pasta foram gerados pela execução de ${report.executedAt}.

- [Matriz](matriz.md)
- [Inventário](inventario.md)
- [Roteiro do áudio](roteiro.md)
- [Performance](performance.md)
- [Checklist do integrador](checklist-integrador.md)

Capturas e JSON ficam em \`qa/rf1-v1c/evidence\` e \`qa/rf1-v1c/reports\`.
`;
}
