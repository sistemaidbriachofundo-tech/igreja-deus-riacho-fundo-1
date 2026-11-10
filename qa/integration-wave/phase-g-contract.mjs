import fs from "node:fs";
import path from "node:path";

/**
 * Fatos do fonte na main. Não substitui o navegador.
 * Persistência ausente permanece BLOCKED. Atalho de menu e saldo inventado permanecem FAIL quando o fonte já os mostra.
 */

function read(root, rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

export function classifyPhaseG(root) {
  const schema = read(root, "packages/db/prisma/schema.prisma");
  const seed = read(root, "packages/db/prisma/seed.ts");
  const gate = read(root, "apps/api/src/ministries/membership/ministry-membership-gate.service.ts");
  const shell = read(root, "apps/web/src/components/AppShell.tsx");
  const treasury = read(root, "apps/web/src/components/TreasuryPanel.tsx");
  const space = read(root, "apps/web/src/components/serving/MemberSpace.tsx");
  const dossier = read(root, "apps/web/src/components/HmlPhaseOne.tsx");
  const ci = read(root, ".github/workflows/ci.yml");
  const navBlock = shell.slice(shell.indexOf("const NAV"), shell.indexOf("const PERSONA_LABELS"));
  const menuFiltersRole = /grants|roleCode/.test(navBlock) && /filter\(/.test(navBlock);
  const items = [
    {
      id: "schema-sem-vinculo-formal",
      status: schema.includes("model MinistryMembership") ? "FAIL" : "BLOCKED",
      summary: schema.includes("model MinistryMembership")
        ? "O schema passou a ter MinistryMembership. A persistência precisa de E2E, não deste relatório."
        : "schema.prisma não tem MinistryMembership. O vínculo formal continua sem tabela. Alteração de schema é do integrador.",
    },
    {
      id: "api-vinculo-501",
      status:
        gate.includes("MINISTRY_MEMBERSHIP_SCHEMA_BLOCKED") && gate.includes("members: null")
          ? "BLOCKED"
          : "FAIL",
      summary:
        gate.includes("MINISTRY_MEMBERSHIP_SCHEMA_BLOCKED") && gate.includes("members: null")
          ? "O gate de ministério ainda termina em bloqueio de schema, com members nulo."
          : "O gate de vínculo formal mudou e não declara mais o bloqueio explícito.",
    },
    {
      id: "seed-publicador",
      status: seed.includes("publicador.demo@example.test") ? "PASS" : "BLOCKED",
      summary: seed.includes("publicador.demo@example.test")
        ? "O seed cria a conta sintética do publicador."
        : "O catálogo tem PUBLICADOR_SITE e o seed não cria publicador.demo@example.test.",
    },
    {
      id: "seed-editor",
      status: seed.includes("editor.demo@example.test") && seed.includes('"EDITOR_SITE"') ? "PASS" : "FAIL",
      summary: "O seed sintético inclui editor.demo@example.test com EDITOR_SITE.",
    },
    {
      id: "menu-por-papel",
      status: menuFiltersRole ? "PASS" : "FAIL",
      summary: menuFiltersRole
        ? "O bloco NAV do AppShell filtra módulos pelo papel."
        : "AppShell publica a mesma lista NAV para todos os papéis. O menu ainda é genérico.",
    },
    {
      id: "tesouraria-sem-engano",
      status:
        treasury.includes("Sem consulta") &&
        treasury.includes("não é saldo da igreja") &&
        treasury.includes("Banco, Pix e maquininha estão bloqueados")
          ? "PASS"
          : "FAIL",
      summary:
        "TreasuryPanel só mostra valor do ledger e rotula a ilustração. Pix, banco e maquininha ficam no texto de bloqueio.",
    },
    {
      id: "meu-espaco-sem-lista",
      status: space.includes("Não há consulta da agenda pessoal") ? "BLOCKED" : "FAIL",
      summary: space.includes("Não há consulta da agenda pessoal")
        ? "Meu Espaço declara que não consulta a agenda pessoal. A lista própria continua ausente."
        : "O texto de Meu Espaço não declara mais a ausência da agenda.",
    },
    {
      id: "ficha-controle-no-fonte",
      status: dossier.includes("Abrir ficha") ? "PASS" : "FAIL",
      summary: dossier.includes("Abrir ficha")
        ? "O diretório HML tem o controle Abrir ficha. Isso não substitui o E2E de salvar e reabrir."
        : "O diretório HML não tem o controle Abrir ficha.",
    },
    {
      id: "ci-sem-suite-g",
      status: /persona-e2e|integration-wave/.test(ci) ? "PASS" : "BLOCKED",
      summary: /persona-e2e|integration-wave/.test(ci)
        ? "O workflow já cita a suíte."
        : "ci.yml não executa qa/persona-e2e nem qa/integration-wave. A proposta fica com o integrador.",
    },
  ];
  return {
    items,
    counts: items.reduce((acc, item) => {
      acc[item.status] = (acc[item.status] ?? 0) + 1;
      return acc;
    }, {}),
  };
}
