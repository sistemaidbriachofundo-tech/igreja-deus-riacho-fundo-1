import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const exportDir = new URL("../../apps/web/out/", import.meta.url);
const index = new URL("index.html", exportDir);

try {
  const info = await stat(index);
  if (!info.isFile()) throw new Error("index.html não é arquivo");
} catch {
  console.error("Export Next.js não encontrado. Compile @idbrf/web com NEXT_PUBLIC_BASE_PATH vazio antes de sincronizar o app.");
  process.exit(1);
}

const html = await readFile(index, "utf8");
if (html.includes("/igreja-deus-riacho-fundo-1/_next/")) {
  console.error("Export com prefixo do GitHub Pages detectado. O app requer assets na raiz (NEXT_PUBLIC_BASE_PATH='').");
  process.exit(1);
}
if (!html.includes("/_next/")) {
  console.warn("Aviso: nenhum asset Next.js /_next/ encontrado no HTML; conferir export manualmente.");
}
console.log(`Export web encontrado: ${fileURLToPath(index)}`);
console.log("Pré-validação OK. Login, CORS e permissões nativas exigem testes em dispositivo.");
