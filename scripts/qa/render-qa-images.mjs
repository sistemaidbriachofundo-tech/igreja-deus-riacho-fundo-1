#!/usr/bin/env node
/** Grava capas e retratos geométricos em public/images/qa. Não usa foto de pessoa real. */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCatalog } from "./catalog.mjs";
import { bannerJpeg, portraitJpeg } from "./jpeg.mjs";

const root = fileURLToPath(new URL("../../apps/web/public/images/qa", import.meta.url));
const catalog = buildCatalog(new Date("2026-11-21T15:00:00.000Z"));
const portraits = join(root, "portraits");
const events = join(root, "events");
mkdirSync(portraits, { recursive: true });
mkdirSync(events, { recursive: true });

for (const person of catalog.people) {
  const jpeg = portraitJpeg(person.portrait);
  writeFileSync(join(portraits, `${person.slug}.jpg`), jpeg);
}
for (const event of catalog.events) {
  writeFileSync(join(events, `${event.slug}.jpg`), bannerJpeg(event.banner));
}
console.error(`Imagens QA gravadas: ${catalog.people.length} retratos e ${catalog.events.length} capas.`);
