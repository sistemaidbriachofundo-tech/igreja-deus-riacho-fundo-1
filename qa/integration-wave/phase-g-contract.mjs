import fs from "node:fs";
import path from "node:path";

/**
 * Inventário do código-fonte. Os testes integrados validam a persistência e as permissões em execução.
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
  const navigation = read(root, "apps/web/src/lib/persona-navigation.ts");
  const membershipModel = /^model MinistryMembership\s*\{/m.test(schema);
  const formalRead = gate.includes("this.team.read(scope)") && gate.includes("members: result.members");
  const menuFiltersRole = shell.includes("shellAreasForRoles(roles)") && navigation.includes("areasForRoles(roles)");
  const personalAgenda = space.includes('data-assignment={item.id}') && space.includes("Sua agenda");
  const items = [
    {
      id: "schema-vinculo-formal",
      status: membershipModel ? "PASS" : "BLOCKED",
      summary: membershipModel
        ? "O schema contém o modelo de vínculo formal."
        : "O schema ainda não contém o modelo de vínculo formal.",
    },
    {
      id: "api-vinculo-formal",
      status: membershipModel && formalRead ? "PASS" : "BLOCKED",
      summary: membershipModel && formalRead
        ? "O gate consulta o serviço de vínculo no escopo autorizado."
        : "A leitura de vínculos carece de modelo ou consulta no serviço.",
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
        ? "O AppShell usa a navegação por papel."
        : "O AppShell precisa consultar a navegação por papel.",
    },
    {
      id: "tesouraria-sem-engano",
      status:
        treasury.includes('state.kind !== "ready"') &&
        treasury.includes("Nenhum valor foi exibido.") &&
        treasury.includes("/treasury/position")
          ? "PASS"
          : "FAIL",
      summary:
        "TreasuryPanel consulta a posição e omite valores quando a consulta está indisponível.",
    },
    {
      id: "meu-espaco-agenda",
      status: personalAgenda ? "PASS" : "BLOCKED",
      summary: personalAgenda ? "Meu Espaço renderiza as designações da agenda pessoal." : "Meu Espaço precisa renderizar a agenda pessoal.",
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
