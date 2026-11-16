import { execFileSync, spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { productionApiOrigin, productionWebOrigin } from "./production-login.mjs";

const projectRoot = new URL("..", import.meta.url);
const apiOrigin = process.env.NEXT_PUBLIC_API_URL ?? productionApiOrigin;
if (apiOrigin !== productionApiOrigin) {
  throw new Error(`A versão de produção exige a API ${productionApiOrigin}.`);
}
const sourceSha = execFileSync("git", ["rev-parse", "--verify", "HEAD"], {
  cwd: projectRoot,
  encoding: "utf8",
}).trim();

const result = spawnSync(process.execPath, [process.env.npm_execpath, "run", "build"], {
  cwd: projectRoot,
  stdio: "inherit",
  env: {
    ...process.env,
    STATIC_EXPORT_DIR: fileURLToPath(new URL("../out", import.meta.url)),
    NEXT_PUBLIC_BASE_PATH: "",
    NEXT_PUBLIC_HML_ENABLED: "false",
    NEXT_PUBLIC_ADMIN_PRODUCTION: "true",
    NEXT_PUBLIC_RIACHINHO_PUBLIC_ENABLED: "true",
    NEXT_PUBLIC_PORTAL_LIVE_ENABLED: "false",
    NEXT_PUBLIC_SITE_LAYOUT_LIVE_ENABLED: "true",
    NEXT_PUBLIC_API_URL: apiOrigin,
  },
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

const release = {
  channel: "production",
  sourceSha,
  phase: "EM_EXECUCAO",
  officialUrl: productionWebOrigin,
  apiOrigin,
};
writeFileSync(new URL("../out/release.json", import.meta.url), JSON.stringify(release, null, 2) + "\n");
