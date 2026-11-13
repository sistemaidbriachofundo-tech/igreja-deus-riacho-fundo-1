import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { counts } from "./classify.mjs";
import { rows } from "./rows.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tally = counts(rows);
const header = `# Matriz do reteste RF1/V1

SHA lido no Git: \`935fd53e8187b840084a845e418dcb06cbd13956\`.
Branch \`previa/rf1-v1\`. Não é a main.

Comparação com a #174, que mediu o Pages \`6c43aea\` em 2026-11-10: 13 FAIL e 9 BLOCKED.

Nesta rodada: **${tally.PASS} PASS**, **${tally.FAIL} FAIL**, **${tally.BLOCKED} BLOCKED**.

PASS não foi usado. A prévia não entregou a aplicação. SSO e falta de credencial ficam BLOCKED. FAIL fica para defeito ainda visível no código montado ou na suíte do próprio SHA.

| ID | #174 | Agora | Acesso | Item | Causa | Evidência |
|---|---|---|---|---|---|---|
${rows.map(row => `| ${row.id} | ${row.previous} | ${row.result} | ${row.access ? "sim" : "não"} | ${row.item} | ${row.cause} | ${row.evidence} |`).join("\n")}
`;

writeFileSync(resolve(root, "reports/matriz.md"), header);
writeFileSync(resolve(root, "reports/matriz.json"), JSON.stringify({
  sha: "935fd53e8187b840084a845e418dcb06cbd13956",
  counts: tally,
  rows,
}, null, 2) + "\n");
console.log(tally);
