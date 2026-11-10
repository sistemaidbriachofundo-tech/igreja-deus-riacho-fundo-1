/**
 * Gera avatares e cenas em SVG.
 * Formas geométricas e inicial. Não é fotografia e não retrata pessoa real.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCatalog, PUBLIC_IMAGE_DIR } from "./catalog.mjs";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const target = join(root, PUBLIC_IMAGE_DIR);
const palette = ["#D4AF37", "#B8742D", "#C6583E", "#4A2612"];

function initials(name) {
  const parts = name.trim().split(/\s+/);
  return `${parts[0]?.[0] ?? ""}${parts.at(-1)?.[0] ?? ""}`.toUpperCase();
}

function avatar(person, index) {
  const accent = palette[index % palette.length];
  const letter = initials(person.displayName);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" role="img" aria-label="Avatar geométrico">
  <rect width="160" height="160" rx="24" fill="#F7EDE0"/>
  <circle cx="80" cy="78" r="48" fill="#4A2612"/>
  <circle cx="80" cy="78" r="44" fill="none" stroke="${accent}" stroke-width="3"/>
  <rect x="28" y="28" width="18" height="4" fill="${accent}"/>
  <rect x="35" y="21" width="4" height="18" fill="${accent}"/>
  <text x="80" y="90" text-anchor="middle" font-family="Montserrat, Inter, sans-serif" font-size="36" font-weight="700" fill="#F7EDE0">${letter}</text>
</svg>
`;
}

function scene(title, accent) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540" role="img" aria-label="${title}">
  <rect width="960" height="540" fill="#4A2612"/>
  <rect x="0" y="390" width="960" height="150" fill="#F7EDE0"/>
  <path d="M80 390 V180 H880 V390" fill="none" stroke="${accent}" stroke-width="8"/>
  <path d="M180 390 V230 H780 V390" fill="none" stroke="#D4AF37" stroke-width="4"/>
  <circle cx="480" cy="150" r="28" fill="${accent}"/>
  <rect x="466" y="122" width="8" height="56" fill="#F7EDE0"/>
  <rect x="452" y="140" width="56" height="8" fill="#F7EDE0"/>
</svg>
`;
}

const catalog = buildCatalog();
mkdirSync(join(target, "avatars"), { recursive: true });
mkdirSync(join(target, "scenes"), { recursive: true });
catalog.people.forEach((person, index) => {
  writeFileSync(join(target, person.avatarFile), avatar(person, index));
});
const scenes = [
  ["homens", "Homens", "#B8742D"],
  ["louvor", "Louvor", "#D4AF37"],
  ["jovens", "Jovens", "#C6583E"],
  ["mulheres", "Mulheres", "#B8742D"],
  ["adolescentes", "Adolescentes", "#C6583E"],
  ["atmosfera", "Atmosfera", "#D4AF37"],
  ["culto", "Culto", "#D4AF37"],
  ["familias", "Famílias", "#B8742D"],
];
for (const [file, title, accent] of scenes) {
  writeFileSync(join(target, "scenes", `${file}.svg`), scene(title, accent));
}
mkdirSync(dirname(join(target, "SOURCES.md")), { recursive: true });
console.error(`SVGs em ${PUBLIC_IMAGE_DIR}: ${catalog.people.length} avatares e ${scenes.length} cenas.`);
