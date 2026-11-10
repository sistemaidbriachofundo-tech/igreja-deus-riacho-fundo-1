import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ownersOfPath } from "../../packages/shared/src/release/revitalization-144.ts";
import { buildInventory } from "./release-inventory-lib.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const inventory = buildInventory(root);

function withOwner(item) {
  return { ...item, owners: ownersOfPath(item.file) };
}

const document = {
  epic: 144,
  integratorIssue: 154,
  localStorageFallbackCount: inventory.localStorageFallbackCount,
  userFacing501Count: inventory.userFacing501Count,
  danglingImports: inventory.dangling,
  storage: inventory.storage.map(withOwner),
  mentions501: inventory.mentions501.map(withOwner),
  removed: [
    {
      path: "apps/web/src/components/ChurchWorkspace.tsx",
      reason: "Nenhum import no produto, nos testes ou nas rotas.",
      rollback: "Restaurar o arquivo e church-workspace.module.css a partir do baseline 3c7375c.",
    },
    {
      path: "apps/web/src/components/church-workspace.module.css",
      reason: "CSS exclusivo de ChurchWorkspace.",
      rollback: "Restaurar junto com ChurchWorkspace.tsx.",
    },
    {
      path: "apps/web/src/app/app/workspace.module.css",
      reason: "Nenhum import de workspace.module.css fora de MinistryWorkspace e ChurchWorkspace, que usam outros arquivos.",
      rollback: "Restaurar o CSS a partir do baseline 3c7375c.",
    },
    {
      path: "apps/web/src/components/DemoLogin.tsx",
      reason: "Só era importado por teste. Nenhuma página montava o componente.",
      rollback: "Restaurar DemoLogin.tsx e o teste de renderização.",
    },
    {
      path: "apps/web/src/app/app/demo/page.tsx",
      reason: "A rota deixou de gravar pessoas em localStorage. O endereço continua e explica que não há cadastro local.",
      rollback: "Restaurar page.tsx e demo.module.css a partir do baseline 3c7375c.",
    },
  ],
  kept: [
    {
      path: "apps/web/src/lib/use-church-records.ts",
      classification: "FALLBACK_ATIVO",
      reason: "Ainda importado por ChurchDashboard, MemberDirectory, ChurchSecretary e ChurchCredentials. Apagar agora quebra as frentes B e C.",
    },
    {
      path: "apps/web/src/lib/api.ts",
      classification: "SESSAO_AUTENTICACAO",
      reason: "sessionStorage guarda o token da sessão. Não é cadastro paralelo.",
    },
    {
      path: "packages/db/prisma/migrations",
      classification: "PRESERVADO",
      reason: "Migrations, auditoria e guards não entram na limpeza.",
    },
  ],
};

const destination = resolve(root, "docs/revitalizacao-144/inventario.json");
mkdirSync(resolve(root, "docs/revitalizacao-144"), { recursive: true });
writeFileSync(destination, `${JSON.stringify(document, null, 2)}\n`);
console.log(`inventario fallbacks=${document.localStorageFallbackCount} telas501=${document.userFacing501Count} residuos=${document.danglingImports.length}`);
if (document.danglingImports.length > 0) process.exit(1);
