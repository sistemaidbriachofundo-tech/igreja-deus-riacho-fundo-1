#!/usr/bin/env node
/** Grava capas e retratos geométricos em public/images/qa. Não usa foto de pessoa real. */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCatalog } from "./catalog.mjs";
import { bannerJpeg, portraitJpeg, receiptJpeg } from "./jpeg.mjs";

const root = fileURLToPath(new URL("../../apps/web/public/images/qa", import.meta.url));
const catalog = buildCatalog(new Date("2026-11-21T15:00:00.000Z"));
const portraits = join(root, "portraits");
const events = join(root, "events");
const receipts = join(root, "receipts");
mkdirSync(portraits, { recursive: true });
mkdirSync(events, { recursive: true });
mkdirSync(receipts, { recursive: true });

for (const person of catalog.people) {
  const jpeg = portraitJpeg(person.portrait);
  writeFileSync(join(portraits, `${person.slug}.jpg`), jpeg);
}
for (const event of catalog.events) {
  writeFileSync(join(events, `${event.slug}.jpg`), bannerJpeg(event.banner));
}
writeFileSync(join(receipts, "sem-valor-fiscal.jpg"), receiptJpeg());
console.error(`Imagens QA gravadas: ${catalog.people.length} retratos, ${catalog.events.length} capas e 1 comprovante fictício.`);
