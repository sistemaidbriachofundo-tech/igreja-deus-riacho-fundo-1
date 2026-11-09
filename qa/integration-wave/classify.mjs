import fs from "node:fs";
import path from "node:path";

/**
 * Classifica a main deste checkout. Não aprova jornada de produto:
 * controle de ficha ausente permanece FAIL; conta de editor ausente
 * permanece BLOCKED. PASS aqui é só fato de código já presente na main.
 */

function read(root, rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function sliceBetween(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  if (from < 0 || to < 0) return "";
  return source.slice(from, to);
}

export function classify(root) {
  const rbac = read(root, "packages/shared/src/rbac.ts");
  const hml = read(root, "apps/web/src/components/HmlPhaseOne.tsx");
  const seed = read(root, "packages/db/prisma/seed.ts");
  const indicatorsController = read(root, "apps/api/src/indicators/indicators.controller.ts");
  const indicatorsService = read(root, "apps/api/src/indicators/indicators.service.ts");
  const auditService = read(root, "apps/api/src/audit/audit.service.ts");
  const auditController = read(root, "apps/api/src/audit/audit.controller.ts");
  const ci = read(root, ".github/workflows/ci.yml");
  const members = sliceBetween(hml, 'view==="members"', 'view==="secretary"');
  const membersHasFichaControl =
    /<button\b/i.test(members) ||
    /\/persons\//.test(members) ||
    /abrir ficha|editar ficha|reabrir ficha/i.test(members);
  const editorGrants = (seed.match(/roleCode:\s*"EDITOR_SITE"/g) ?? []).length;
  const editorCatalog = rbac.includes('EDITOR_SITE: "EDITOR_SITE"') && seed.includes('"EDITOR_SITE"');
  const canonEditor =
    /EDITOR_SITE:\s*"EDITOR_SITE"/.test(rbac) &&
    /PUBLICADOR_SITE:\s*"PUBLICADOR_SITE"/.test(rbac) &&
    !rbac.includes("SITE_EDITOR") &&
    !rbac.includes("SITE_PUBLISHER");
  const refreshClearsAnyError = /refresh\(stored\)[\s\S]{0,220}clearToken\(/.test(hml);

  const items = [
    {
      id: "secretaria-abrir-ficha-ui",
      persona: "SECRETARIA",
      gate: "produto",
      status: membersHasFichaControl ? "BLOCKED" : "FAIL",
      summary: membersHasFichaControl
        ? "O diretório passou a ter controle de ficha no fonte. Isso não aprova a jornada: falta E2E buscar→abrir."
        : "O diretório HML em HmlPhaseOne lista a pessoa e não tem controle para abrir a ficha.",
    },
    {
      id: "secretaria-editar-ficha-ui",
      persona: "SECRETARIA",
      gate: "produto",
      status: membersHasFichaControl ? "BLOCKED" : "FAIL",
      summary: membersHasFichaControl
        ? "Há controle novo no fonte. A edição persistida continua sem E2E e sem aprovação."
        : "Não há formulário de edição na tela de membros. O PATCH da API aceita só isMinor, legalGuardianPersonId e householdId.",
    },
    {
      id: "secretaria-reabrir-ficha-ui",
      persona: "SECRETARIA",
      gate: "produto",
      status: membersHasFichaControl ? "BLOCKED" : "FAIL",
      summary: membersHasFichaControl
        ? "Há controle novo no fonte. Reabrir a mesma ficha continua sem E2E."
        : "Sem ficha aberta na interface, não há como fechar e reabrir o mesmo cadastro.",
    },
    {
      id: "editor-conta-sintetica",
      persona: "EDITOR",
      gate: "produto",
      status: editorCatalog && editorGrants === 0 ? "BLOCKED" : editorGrants > 0 ? "BLOCKED" : "FAIL",
      summary:
        editorGrants > 0
          ? "O seed passou a conceder EDITOR_SITE. O login sintético continua sem E2E desta onda."
          : "O catálogo tem EDITOR_SITE e o seed não cria grant para usuário sintético. Login de editor fica bloqueado.",
    },
    {
      id: "ci-suite-onda",
      persona: "QA",
      gate: "processo",
      status: /persona-e2e|integration-wave/.test(ci) ? "BLOCKED" : "BLOCKED",
      summary: /persona-e2e|integration-wave/.test(ci)
        ? "O workflow cita a suíte. Ligação no CI compartilhado continua com handoff do integrador e não conta como E2E."
        : ".github/workflows/ci.yml não executa qa/persona-e2e nem qa/integration-wave. Build e lint não substituem E2E.",
    },
    {
      id: "indicadores-contagem-pastoral",
      persona: "PASTOR",
      gate: "contrato",
      status:
        indicatorsService.includes("pastoralOpen") && !indicatorsController.includes("@Roles")
          ? "BLOCKED"
          : "BLOCKED",
      summary: indicatorsService.includes("pastoralOpen") && !indicatorsController.includes("@Roles")
        ? "GET /indicators/summary inclui pastoralOpen e o controller não declara @Roles. Separar o agregado é alteração do service, fora desta frente."
        : "O agregado pastoralOpen mudou no fonte. A exposição segue bloqueada até revisão do service e novo teste de persona.",
    },
    {
      id: "auditoria-metadata-sem-redacao",
      persona: "PLATFORM_ADMIN",
      gate: "contrato",
      status: /metadata:\s*row\.metadata/.test(auditService) ? "BLOCKED" : "BLOCKED",
      summary: /metadata:\s*row\.metadata/.test(auditService)
        ? "GET /audit-logs devolve metadata cru. Secretaria, pastor e admin técnico leem a trilha; redação do payload é alteração do AuditService."
        : "O retorno de metadata mudou. A redação continua bloqueada até teste do payload.",
    },
    {
      id: "canon-papel-editor",
      persona: "EDITOR",
      gate: "contrato",
      status: canonEditor ? "PASS" : "FAIL",
      summary: canonEditor
        ? "A main nomeia EDITOR_SITE e PUBLICADOR_SITE. SITE_EDITOR e SITE_PUBLISHER não estão em rbac.ts."
        : "O catálogo de papéis da main divergiu de EDITOR_SITE/PUBLICADOR_SITE.",
    },
    {
      id: "hml-limpa-token-em-qualquer-erro",
      persona: "SECRETARIA",
      gate: "contrato",
      status: refreshClearsAnyError ? "BLOCKED" : "BLOCKED",
      summary: refreshClearsAnyError
        ? "HmlPhaseOne chama clearToken em qualquer falha do refresh inicial. Com o PR #103, timeout e 403 do gate passam a preservar a sessão; este catch apaga o token. Ajuste é da frente de Secretaria, no próprio HmlPhaseOne."
        : "O catch do refresh de HmlPhaseOne mudou. A combinação com o PR #103 segue sem E2E de reload.",
    },
    {
      id: "audit-papeis-do-controller",
      persona: "PLATFORM_ADMIN",
      gate: "contrato",
      status:
        ["SECRETARIA", "PASTOR", "PLATFORM_ADMIN"].every((role) => auditController.includes(role)) &&
        !auditController.includes("EDITOR_SITE") &&
        !auditController.includes("TESOURARIA")
          ? "PASS"
          : "FAIL",
      summary:
        "O controller audit-logs lista Secretaria, pastor e admin técnico. Editor e tesouraria ficam de fora desta rota.",
    },
  ];

  return {
    generatedFrom: "source",
    items,
    counts: items.reduce((acc, item) => {
      acc[item.status] = (acc[item.status] ?? 0) + 1;
      return acc;
    }, {}),
  };
}

export function productApproved(report) {
  const product = report.items.filter((item) => item.gate === "produto");
  return product.length > 0 && product.every((item) => item.status === "PASS");
}

function printReport(report) {
  const counts = report.counts;
  console.log(`# Checklist de integração (fonte da main)`);
  console.log("");
  console.log(
    `Contagens: ${counts.PASS ?? 0} PASS, ${counts.FAIL ?? 0} FAIL, ${counts.BLOCKED ?? 0} BLOCKED.`,
  );
  console.log("PASS neste relatório é fato de código. Não homologa tela, sessão nem persona.");
  console.log("");
  console.log("| ID | Persona | Resultado | Detalhe |");
  console.log("|---|---|---|---|");
  for (const item of report.items) {
    const detail = item.summary.replaceAll("|", "/");
    console.log(`| ${item.id} | ${item.persona} | ${item.status} | ${detail} |`);
  }
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]).endsWith(`${path.sep}classify.mjs`);
if (isDirectRun) {
  const root = path.resolve(path.dirname(process.argv[1]), "../..");
  printReport(classify(root));
}
