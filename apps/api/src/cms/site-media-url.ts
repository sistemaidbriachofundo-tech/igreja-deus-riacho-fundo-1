/**
 * Imagem institucional aceita só da biblioteca versionada, do Blob da igreja
 * ou do armazenamento local explicitamente habilitado. URL solta não publica.
 */
const LIBRARY = /^\/images\/[a-zA-Z0-9/_-]+\.(?:jpg|jpeg|png|webp|avif)$/i;
const LOCAL_FILE =
  /^\/cms\/site-media\/files\/[A-Za-z0-9_-]{1,80}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[a-z0-9-]{1,45}\.(?:jpg|png|webp|avif)$/i;
const BLOB_PATH =
  /^\/church\/[A-Za-z0-9_-]+\/site\/[A-Za-z0-9._-]+\.(?:jpg|jpeg|png|webp|avif)$/i;

export function isAllowedSiteImage(value: string): boolean {
  if (LIBRARY.test(value) || LOCAL_FILE.test(value)) return true;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.hash) return false;
    if (!url.hostname.endsWith(".public.blob.vercel-storage.com")) return false;
    return BLOB_PATH.test(url.pathname);
  } catch {
    return false;
  }
}
