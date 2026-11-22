import { Controller, Get, Header, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { Public } from "../auth/decorators/public.decorator";
import { parseYoutubeStreams, YOUTUBE_STREAMS_FEED } from "./youtube-streams.controller";

const CHANNEL = "UCpd6-RQKVIKfje5usHzYiiA";
const LIVE_PAGE = "https://www.youtube.com/c/IDBRiachoFundo1IDB/live";
const CHANNEL_LIVE_PAGE = "https://www.youtube.com/channel/" + CHANNEL + "/live";
const REFRESH_MS = 30_000;

type Broadcast = { id: string; title: string; embeddable: boolean };
type State = { broadcast: Broadcast | null };

function youtubeVideoId(address: string): string | null {
  const url = new URL(address);
  const id = url.searchParams.get("v");
  return url.origin === "https://www.youtube.com" && url.pathname === "/watch" && id && /^[\w-]{11}$/.test(id) ? id : null;
}

async function fetchYoutubePage(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal, headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0" } });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error("YouTube HTTP " + response.status);
  }
  return { url: response.url, html: await response.text() };
}

type YoutubePlayer = {
  videoDetails?: { videoId?: string; channelId?: string; title?: string };
  microformat?: { playerMicroformatRenderer?: { liveBroadcastDetails?: { isLiveNow?: boolean; endTimestamp?: string } } };
  playabilityStatus?: { status?: string; playableInEmbed?: boolean };
};

function extractPlayerJson(html: string): YoutubePlayer | null {
  // O YouTube pode acrescentar JavaScript após o objeto; não devemos tentar
  // JSON.parse do conteúdo inteiro até </script>.
  const marker = /\bytInitialPlayerResponse\s*=\s*/.exec(html);
  if (!marker) return null;
  const start = marker.index + marker[0].length;
  if (html[start] !== "{") return null;
  let depth = 0, inString = false, escaped = false;
  for (let i = start; i < html.length && i < start + 3_000_000; i++) {
    const char = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
    } else {
      if (char === '"') inString = true;
      else if (char === "{") depth++;
      else if (char === "}" && --depth === 0) {
        try { return JSON.parse(html.slice(start, i + 1)) as YoutubePlayer; }
        catch { return null; }
      }
    }
  }
  return null;
}

export function activeYoutubeBroadcast(html: string, videoId: string): Broadcast | null {
  const player = extractPlayerJson(html);
  const video = player?.videoDetails;
  const live = player?.microformat?.playerMicroformatRenderer?.liveBroadcastDetails;
  if (!/^[\w-]{11}$/.test(videoId) || video?.videoId !== videoId || video.channelId !== CHANNEL ||
      typeof video.title !== "string" || !video.title.trim() || live?.isLiveNow !== true ||
      live.endTimestamp || player?.playabilityStatus?.status !== "OK") return null;
  return { id: videoId, title: video.title.trim(), embeddable: player.playabilityStatus.playableInEmbed !== false };
}

@Injectable()
export class YoutubeLiveService {
  private current?: State;
  private nextRefresh = 0;
  private pending?: Promise<State>;

  getStatus() {
    if (Date.now() < this.nextRefresh) {
      if (this.current) return Promise.resolve(this.current);
      throw new ServiceUnavailableException("Não foi possível consultar o canal do YouTube.");
    }
    this.pending ??= this.refresh().finally(() => {
      this.nextRefresh = Date.now() + REFRESH_MS;
      this.pending = undefined;
    });
    return this.pending;
  }

  private async refresh(): Promise<State> {
    try {
      const budget = AbortSignal.timeout(18_000);
      // HTTP 200 sem player não comprova ausência de transmissão. Teste o
      // feed oficial mesmo quando a página /live não redireciona.
      let channelFailed: unknown = null;
      const fromChannel = await this.fromChannel(budget).catch(error => { channelFailed = error; return null; });
      let feedFailed: unknown = null;
      const broadcast = fromChannel ?? await this.fromFeed(budget).catch(error => { feedFailed = error; return null; });
      if (!broadcast && channelFailed && feedFailed) throw feedFailed;
      this.current = { broadcast };
      return this.current;
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Resposta indisponível";
      console.warn("[youtube-live] " + detail);
      this.current = undefined;
      throw new ServiceUnavailableException("Não foi possível consultar o canal do YouTube.");
    }
  }

  private async fromChannel(budget: AbortSignal): Promise<Broadcast | null> {
    const shortAttempt = () => AbortSignal.any([budget, AbortSignal.timeout(8_000)]);
    const { url, html } = await fetchYoutubePage(LIVE_PAGE, shortAttempt())
      .catch(() => fetchYoutubePage(CHANNEL_LIVE_PAGE, shortAttempt()));
    const redirectedVideo = youtubeVideoId(url);
    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/i)?.[1];
    const videoId = redirectedVideo ?? (canonical ? youtubeVideoId(canonical) : null);
    if (!videoId) return null;

    const live = activeYoutubeBroadcast(html, videoId);
    if (live || redirectedVideo) return live;
    const watch = await fetchYoutubePage("https://www.youtube.com/watch?v=" + videoId, budget);
    return activeYoutubeBroadcast(watch.html, videoId);
  }

  private async fromFeed(signal: AbortSignal): Promise<Broadcast | null> {
    const response = await fetch(YOUTUBE_STREAMS_FEED, {
      signal, headers: { Accept: "application/atom+xml" },
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error("Feed do YouTube HTTP " + response.status);
    }
    const candidates = parseYoutubeStreams(await response.text());
    for (const candidate of candidates) {
      try {
        const watch = await fetchYoutubePage("https://www.youtube.com/live/" + candidate.id, signal);
        const verified = activeYoutubeBroadcast(watch.html, candidate.id);
        if (verified) return verified;
      } catch {
        // Vídeo indisponível não deve ocultar outro vídeo ainda ao vivo.
      }
    }
    return null;
  }

}

@Controller("public/youtube-live")
export class YoutubeLiveController {
  constructor(private readonly live: YoutubeLiveService) {}

  @Public()
  @Get()
  @Header("Cache-Control", "no-store, max-age=0")
  status() {
    return this.live.getStatus();
  }
}
