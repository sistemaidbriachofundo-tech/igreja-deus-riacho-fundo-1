/**
 * Public projection of the existing NestJS F4/F5 API.
 * Explicitly NO authentication, private profiles, pastoral notes or member data.
 *
 * This file is intentionally usable in both tests and client components.
 */
export type PublishedNews = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  body: string | null;
  imageUrl: string | null;
  publishedAt: string | null;
  kind: "NEWS" | "HOME_BLOCK" | "BANNER" | "MINISTRY_CONTENT" | "PAGE";
};

export type PublishedEvent = {
  id: string;
  slug: string;
  name: string;
  startsAt: string;
  endsAt: string | null;
  description: string | null;
  imageUrl: string | null;
  locationText: string | null;
  ministryId: string | null;
  featuredOnHome: boolean;
};

export type PublishedMinistry = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  coverImageUrl: string | null;
};

export type PublishedMinistryDetail = PublishedMinistry & {
  leadership: { displayName: string; roleTitle: string }[];
  galleryUrls: string[];
  scheduleText: string | null;
  participationInfo: string | null;
  relatedEvents: PublishedEvent[];
  relatedContent: PublishedNews[];
};

export type PublishedHome = {
  church: { name: string; slug: string };
  featuredEvents: PublishedEvent[];
  contentBlocks: PublishedNews[];
  banners: PublishedNews[];
  ministries: PublishedMinistry[];
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : null;

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const optionalText = (value: unknown): string | null => text(value);
const safeImage = (value: unknown): string | null => {
  const raw = text(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? raw : null;
  } catch { return null; }
};
const isoDate = (value: unknown): string | null => {
  const raw = text(value);
  if (!raw || !/^\d{4}-\d{2}-\d{2}T/.test(raw)) return null;
  return Number.isFinite(Date.parse(raw)) ? raw : null;
};

export function parsePublishedEvent(value: unknown): PublishedEvent | null {
  const row = asRecord(value);
  if (!row) return null;
  const id = text(row.id), name = text(row.name), slug = text(row.slug), startsAt = isoDate(row.startsAt);
  if (!id || !name || !slug || !startsAt) return null;
  return {
    id, name, slug, startsAt,
    endsAt: isoDate(row.endsAt),
    description: optionalText(row.description),
    imageUrl: safeImage(row.imageUrl),
    locationText: optionalText(row.locationText),
    ministryId: optionalText(row.ministryId),
    featuredOnHome: row.featuredOnHome === true,
  };
}

export function parsePublishedNews(value: unknown): PublishedNews | null {
  const row = asRecord(value);
  if (!row) return null;
  const kind = text(row.kind) as PublishedNews["kind"] | null;
  if (!kind || !["NEWS","HOME_BLOCK","BANNER","MINISTRY_CONTENT","PAGE"].includes(kind)) return null;
  const id = text(row.id), slug = text(row.slug), title = text(row.title);
  if (!id || !slug || !title) return null;
  return {
    id, slug, title, kind,
    summary: optionalText(row.summary),
    body: optionalText(row.body),
    imageUrl: safeImage(row.imageUrl),
    publishedAt: isoDate(row.publishedAt),
  };
}

export function parsePublishedMinistry(value: unknown): PublishedMinistry | null {
  const row = asRecord(value);
  if (!row) return null;
  const id = text(row.id), slug = text(row.slug), name = text(row.name);
  if (!id || !slug || !name) return null;
  return { id, slug, name, description: optionalText(row.description), coverImageUrl: safeImage(row.coverImageUrl) };
}

const filtered = <T>(value: unknown, parse: (value: unknown) => T | null): T[] =>
  Array.isArray(value) ? value.map(parse).filter((row): row is T => row !== null) : [];

export function parsePublishedHome(value: unknown): PublishedHome | null {
  const row = asRecord(value), church = asRecord(row?.church);
  const name = text(church?.name), slug = text(church?.slug);
  if (!row || !name || !slug) return null;
  return {
    church: { name, slug },
    featuredEvents: filtered(row.featuredEvents, parsePublishedEvent),
    contentBlocks: filtered(row.contentBlocks, parsePublishedNews),
    banners: filtered(row.banners, parsePublishedNews),
    ministries: filtered(row.ministries, parsePublishedMinistry),
  };
}

export function parsePublishedEvents(value: unknown): PublishedEvent[] | null {
  const row = asRecord(value);
  if (!row || !Array.isArray(row.events)) return null;
  return filtered(row.events, parsePublishedEvent);
}

export function parsePublishedMinistryDetail(value: unknown): PublishedMinistryDetail | null {
  const row = asRecord(value);
  const base = parsePublishedMinistry(value);
  if (!row || !base) return null;
  const leadership = filtered(row.leadership, (raw) => {
    const person = asRecord(raw), displayName = text(person?.displayName), roleTitle = text(person?.roleTitle);
    return displayName && roleTitle ? { displayName, roleTitle } : null;
  });
  return {
    ...base, leadership,
    galleryUrls: Array.isArray(row.galleryUrls)
      ? row.galleryUrls.map(safeImage).filter((url): url is string => url !== null) : [],
    scheduleText: optionalText(row.scheduleText),
    participationInfo: optionalText(row.participationInfo),
    relatedEvents: filtered(row.relatedEvents, parsePublishedEvent),
    relatedContent: filtered(row.relatedContent, parsePublishedNews),
  };
}

export function currentPublishedEvents(events: PublishedEvent[], now: number = Date.now()): PublishedEvent[] {
  return events.filter((event) => Date.parse(event.endsAt ?? event.startsAt) >= now)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

export function formatPortalDate(value: string): { day: string; month: string; dayAndTime: string } {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return { day: "—", month: "—", dayAndTime: "Data a confirmar" };
  return {
    day: new Intl.DateTimeFormat("pt-BR", { day:"2-digit",timeZone:"America/Sao_Paulo" }).format(date),
    month: new Intl.DateTimeFormat("pt-BR", { month:"short",timeZone:"America/Sao_Paulo" }).format(date).replace(".","").toUpperCase(),
    dayAndTime: new Intl.DateTimeFormat("pt-BR", { weekday:"long", day:"numeric",month:"long",hour:"2-digit",minute:"2-digit",timeZone:"America/Sao_Paulo" }).format(date),
  };
}

/** Do not silently request localhost from the deployed static website. */
export function publicApiBase(configured: string | undefined): string | null {
  const value = configured?.trim().replace(/\/+$/, "");
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return url.href.replace(/\/+$/, "");
    if (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)) return url.href.replace(/\/+$/, "");
  } catch { /* invalid environment configuration */ }
  return null;
}

export async function fetchPublished<T>(
  path: string, parse: (value: unknown) => T | null,
  { signal, apiUrl }: { signal?: AbortSignal; apiUrl?: string } = {},
): Promise<T> {
  // Opt-in prevents published-looking seed/demo records from reaching production.
  if (apiUrl === undefined && process.env.NEXT_PUBLIC_PORTAL_LIVE_ENABLED !== "true") {
    throw new Error("PUBLIC_PORTAL_NOT_RELEASED");
  }
  const base = publicApiBase(apiUrl ?? process.env.NEXT_PUBLIC_API_URL);
  if (!base) throw new Error("PUBLIC_API_NOT_CONFIGURED");
  if (!/^\/public\/[a-z0-9/-]+$/.test(path)) throw new Error("PUBLIC_API_PATH_INVALID");
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once:true });
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(base + path, {
      method:"GET", mode:"cors", credentials:"omit", cache:"no-store",
      headers:{ Accept:"application/json" }, signal:controller.signal,
    });
    if (!response.ok) throw new Error("PUBLIC_API_UNAVAILABLE");
    const json: unknown = await response.json();
    const parsed = parse(json);
    if (parsed === null) throw new Error("PUBLIC_API_INVALID_RESPONSE");
    return parsed;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}
