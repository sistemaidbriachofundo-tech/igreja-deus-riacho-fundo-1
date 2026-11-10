import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pagesReleaseDocument } from "../../packages/shared/src/release/eklesia-gate.ts";

const root = fileURLToPath(new URL("../..", import.meta.url));
const destination = process.env.RELEASE_JSON_PATH
  ? resolve(process.env.RELEASE_JSON_PATH)
  : resolve(root, "apps/web/public/release.json");

const document = pagesReleaseDocument({
  eventName: process.env.GITHUB_EVENT_NAME,
  ref: process.env.GITHUB_REF,
  sha: process.env.GITHUB_SHA,
});

writeFileSync(destination, `${JSON.stringify(document, null, 2)}\n`);
console.log(`release.json ${document.channel} sha=${document.sourceSha ?? "null"} fase=${document.phase}`);
