import { Controller, Get, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { Public } from "../auth/decorators/public.decorator";

const CHANNEL_ID = "UCpd6-RQKVIKfje5usHzYiiA";
const FEED_URL = "https://www.youtube.com/feeds/videos.xml?playlist_id=UULVpd6-RQKVIKfje5usHzYiiA";
const REFRESH_MS = 5 * 60_000;
const RETRY_MS = 60_000;
type Recording = { id: string; title: string; publishedAt: string };

function decodeXml(text: string) {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
  return text.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, (encoded, entity: string) => {
    if (!entity.startsWith("#")) return named[entity] ?? encoded;
    const hexadecimal = entity[1] === "x";
    const value = Number.parseInt(entity.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
    return value > 0 && value <= 0x10ffff && !(value >= 0xd800 && value <= 0xdfff)
      ? String.fromCodePoint(value) : encoded;
  });
}

export function parseYoutubeStreams(xml: string, now = Date.now()): Recording[] {
  const seen = new Set<string>();
  const recordings: Recording[] = [];
  for (const [, entry] of xml.matchAll(/<entry>\s*([\s\S]*?)<\/entry>/g)) {
    const id = entry.match(/<yt:videoId>([\w-]{11})<\/yt:videoId>/)?.[1];
    const channel = entry.match(/<yt:channelId>([\w-]+)<\/yt:channelId>/)?.[1];
    const published = entry.match(/<published>([^<]+)<\/published>/)?.[1];
    const time = Date.parse(published ?? "");
    const title = decodeXml(entry.match(/<title>([^<]*)<\/title>/)?.[1] ?? "").trim();
    if (!id || seen.has(id) || channel !== CHANNEL_ID || !title || !Number.isFinite(time) || time > now) continue;
    seen.add(id);
    recordings.push({ id, title, publishedAt: new Date(time).toISOString() });
  }
  return recordings.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 3);
}

@Injectable()
export class YoutubeStreamsService {
  private current?: { recordings: Recording[] };
  private nextRefresh = 0;
  private pending?: Promise<{ recordings: Recording[] }>;

  list() {
    if (Date.now() < this.nextRefresh) {
      if (this.current) return Promise.resolve(this.current);
      throw new ServiceUnavailableException("Gravações temporariamente indisponíveis.");
    }
    this.pending ??= this.refresh().finally(() => { this.pending = undefined; });
    return this.pending;
  }

  private async refresh() {
    try {
      const response = await fetch(FEED_URL, {
        signal: AbortSignal.timeout(5_000),
        headers: { Accept: "application/atom+xml" },
      });
      if (!response.ok) throw new Error("Feed indisponível");
      const recordings = parseYoutubeStreams(await response.text());
      if (!recordings.length) throw new Error("Feed sem gravações");
      this.nextRefresh = Date.now() + REFRESH_MS;
      this.current = { recordings };
      return this.current;
    } catch {
      this.nextRefresh = Date.now() + RETRY_MS;
      if (this.current) return this.current;
      throw new ServiceUnavailableException("Gravações temporariamente indisponíveis.");
    }
  }
}

@Controller("public/youtube-recordings")
export class YoutubeStreamsController {
  constructor(private readonly streams: YoutubeStreamsService) {}

  @Public()
  @Get()
  list() {
    return this.streams.list();
  }
}
