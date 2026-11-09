const FULL_SHA = /^[0-9a-f]{40}$/;

/**
 * Commit implantado na API.
 * Só aceita SOURCE_SHA (script HML) ou VERCEL_GIT_COMMIT_SHA (deploy Vercel).
 * GITHUB_SHA de um workflow do Pages não identifica o processo da API.
 */
export function readSourceSha(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const raw = (env.SOURCE_SHA ?? env.VERCEL_GIT_COMMIT_SHA ?? "").trim().toLowerCase();
  return FULL_SHA.test(raw) ? raw : null;
}
