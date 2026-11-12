import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { webPreviewReleaseDocument } from "./web-preview.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const destination = resolve(root, "apps/web/public/release.json");
const document = webPreviewReleaseDocument(process.env.WEB_PREVIEW_SHA);
writeFileSync(destination, `${JSON.stringify(document, null, 2)}\n`);
console.log(`release.json channel=${document.channel} sha=${document.sourceSha} ready=${document.ready}`);
