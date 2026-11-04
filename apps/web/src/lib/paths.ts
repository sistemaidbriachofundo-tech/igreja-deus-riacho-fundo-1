/** Prefixo GitHub Pages / override local (NEXT_PUBLIC_BASE_PATH). */
export function withBasePath(path: string): string {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (!base) {
    return normalized;
  }
  return `${base.replace(/\/$/, "")}${normalized}`;
}
