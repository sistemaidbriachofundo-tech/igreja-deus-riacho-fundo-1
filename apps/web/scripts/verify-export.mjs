import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { acceptExportedRelease } from "../../../scripts/hml/web-preview.mjs";

// Executado após o build estático do Next.js para GitHub Pages.
// Confere rotas exportadas, navegação e assets locais.
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(process.env.STATIC_EXPORT_DIR ?? join(projectRoot, "out"));
const base = (process.env.NEXT_PUBLIC_BASE_PATH ?? (process.env.VERCEL === "1" ? "" : "/igreja-deus-riacho-fundo-1")).replace(/\/$/, "");
const requiredPages = [
  "index.html", "a-igreja/index.html", "contato/index.html", "eventos/index.html", "visita/index.html",
  "ministerios/index.html",
  ...["jovens", "homens", "adolescentes", "mulheres", "atmosfera"].map(slug => `ministerios/${slug}/index.html`),
  "novidades/index.html", "status/index.html", "login/index.html",
  "app/index.html", "app/membros/index.html", "app/secretaria/index.html",
  "app/membros/carteirinha/index.html", "app/editorial/index.html", "app/site/index.html", "app/demo/index.html",
  "app/operacao/index.html",
];
const requiredGalleryAssets = ["louvor", "juventude", "oracao", "palavra"].map((name) => `images/galeria-${name}.webp`);
const failures = [];
if (!existsSync(outDir)) throw new Error(`Static export not found: ${outDir}`);
for (const asset of requiredGalleryAssets) {
  if (!existsSync(join(outDir, asset))) failures.push(`Missing gallery photo: ${asset}`);
}
for (const page of requiredPages) {
  if (!existsSync(join(outDir, page))) failures.push(`Missing expected page: ${page}`);
}
function* findHtml(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const absolute = join(dir, entry.name);
    if (entry.isDirectory()) yield* findHtml(absolute);
    else if (entry.isFile() && entry.name.endsWith(".html")) yield absolute;
  }
}
let count = 0;
let internalLinks = 0;
for (const page of findHtml(outDir)) {
  count++;
  const html = readFileSync(page, "utf8");
  for (const match of html.matchAll(/<(?:a|img|script|link)\b[^>]*>/gi)) {
    for (const [, url] of match[0].matchAll(/\b(?:href|src)="([^"]+)"/gi)) {
      if (/^(?:https?:|data:|mailto:|tel:|blob:|\/\/|#)/i.test(url)) continue;
      let pathname;
      try {
        pathname = decodeURIComponent(new URL(url, "https://preview.test" + base + "/").pathname);
      } catch {
        failures.push(`Invalid URL in ${relative(outDir, page)}: ${url}`);
        continue;
      }
      let target;
      if (url.startsWith("/")) {
        if (base && pathname !== base && !pathname.startsWith(base + "/")) {
          failures.push(`Escapes GitHub Pages basePath in ${relative(outDir, page)}: ${url}`);
          continue;
        }
        target = resolve(outDir, base ? pathname.slice(base.length).replace(/^\//, "") : pathname.replace(/^\//, ""));
      } else {
        target = resolve(dirname(page), decodeURIComponent(url.split(/[?#]/)[0]));
      }
      internalLinks++;
      if (!existsSync(target) && !existsSync(join(target, "index.html"))) {
        failures.push(`Broken reference in ${relative(outDir, page)}: ${url}`);
      }
    }
  }
  if (relative(outDir, page) === "login/index.html") {
    if (!/<input[^>]+type="email"/.test(html) || !/<input[^>]+type="password"/.test(html)) {
      failures.push("Login must display email and password inputs before opening the dashboard.");
    }
  }
  if (relative(outDir, page) === "app/index.html" && !html.includes("Verificando seu acesso")) {
    failures.push("Admin route must start behind the authentication gate.");
  }
  if (requiredPages.includes(relative(outDir, page))) {
    const headingCount = [...html.matchAll(/<h1(?:\s|>)/gi)].length;
    // Em HML, o AppShell protege /status antes de /auth/me; não existe H1
    // no HTML anônimo. Exigir o marcador do gate, sem relaxar páginas públicas.
    const protectedStatusGate = process.env.NEXT_PUBLIC_HML_ENABLED === "true" &&
      relative(outDir, page) === "status/index.html" &&
      headingCount === 0 &&
      html.includes("Confirmando seu perfil") &&
      html.includes('data-nav-state="pending"');
    if (headingCount !== 1 && !protectedStatusGate) failures.push(`${relative(outDir, page)} has ${headingCount} H1 headings (expected 1)`);
  }
}
const releasePath = join(outDir, "release.json");
if (!existsSync(releasePath)) {
  failures.push("Missing release.json");
} else {
  try {
    const release = JSON.parse(readFileSync(releasePath, "utf8"));
    const verdict = acceptExportedRelease(release, {
      eventName: process.env.GITHUB_EVENT_NAME,
      ref: process.env.GITHUB_REF,
      sha: process.env.WEB_PREVIEW_SHA || process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA,
      previewChannel: process.env.WEB_PREVIEW_CHANNEL,
    });
    failures.push(...verdict.reasons);
  } catch {
    failures.push("release.json inválido");
  }
}
if (failures.length) {
  console.error(`Static export QA failed (${failures.length} issues):\n` + failures.slice(0, 40).join("\n"));
  process.exit(1);
}
console.log(`Static export QA passed: ${count} HTML pages, ${requiredPages.length} required routes and ${internalLinks} local references.`);
