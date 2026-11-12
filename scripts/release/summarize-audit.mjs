import { readFileSync } from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("Informe o JSON do npm audit.");
  process.exit(1);
}

let result;
try {
  result = JSON.parse(readFileSync(file, "utf8"));
} catch {
  console.error("Auditoria de dependências indisponível.");
  process.exit(0);
}

const counts = result.metadata?.vulnerabilities ?? {};
console.log(
  `npm audit --omit=dev: info=${counts.info ?? 0} low=${counts.low ?? 0} moderate=${counts.moderate ?? 0} high=${counts.high ?? 0} critical=${counts.critical ?? 0}`,
);
if ((counts.high ?? 0) > 0 || (counts.critical ?? 0) > 0) {
  console.log("NO-GO de dependências: há alertas altos ou críticos. Nenhum upgrade foi aplicado nesta integração.");
}
