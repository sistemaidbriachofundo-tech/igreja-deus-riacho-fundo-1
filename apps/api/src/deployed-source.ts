import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readSourceSha } from "@idbrf/shared";

function readBuiltSourceSha(): string | null {
  try {
    const identity = JSON.parse(readFileSync(join(__dirname, "release-identity.json"), "utf8"));
    return typeof identity.sourceSha === "string"
      ? readSourceSha({ SOURCE_SHA: identity.sourceSha })
      : null;
  } catch {
    // Execução em watch e alguns empacotadores fornecem o SHA pelo ambiente.
    return null;
  }
}

const builtSourceSha = readBuiltSourceSha();

export function deployedSourceSha(): string | null {
  return builtSourceSha ?? readSourceSha();
}
