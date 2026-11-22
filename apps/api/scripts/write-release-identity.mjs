import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";

let checkoutSha;
try {
  const git = ["/usr/bin/git", "/bin/git", "/usr/local/bin/git"].find(path => existsSync(path));
  if (git) checkoutSha = execFileSync(git, ["rev-parse", "--verify", "HEAD"], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
} catch {
  // Os builders de imagem podem receber o código sem o diretório .git.
}

const sourceSha = [checkoutSha, process.env.VERCEL_GIT_COMMIT_SHA, process.env.SOURCE_SHA]
  .map((value) => value?.trim().toLowerCase())
  .find((value) => /^[a-f0-9]{40}$/.test(value ?? "")) ?? null;
writeFileSync(new URL("../dist/release-identity.json", import.meta.url), JSON.stringify({ sourceSha }) + "\n");
