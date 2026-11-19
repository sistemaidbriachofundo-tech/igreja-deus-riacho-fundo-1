import { Controller, Get, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { Public } from "../auth/decorators/public.decorator";

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
  const response = await fetch(url, { signal, headers: { Accept: "text/html" } });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error("Página do YouTube indisponível");
  }
  return { url: response.url, html: await response.text() };
}

type YoutubePlayer = {
  videoDetails?: { videoId?: string; channelId?: string; title?: string };
  microformat?: { playerMicroformatRenderer?: { liveBroadcastDetails?: { isLiveNow?: boolean; endTimestamp?: string } } };
  playabilityStatus?: { status?: string; playableInEmbed?: boolean };
};

export function activeYoutubeBroadcast(html: string, videoId: string): Broadcast | null {
  const marker = /\bytInitialPlayerResponse\s*=\s*/.exec(html);
  if (!marker) return null;
  const start = marker.index + marker[0].length;
  const end = html.indexOf("</script", start);
  if (end < 0) return null;

  let player: YoutubePlayer | null;
  try {
    player = JSON.parse(html.slice(start, end).trim().replace(/;$/, ""));
  } catch {
    return null;
  }
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
      const budget = AbortSignal.timeout(6_500);
      // The channel's public custom URL generally includes its complete live player.
      const firstAttempt = AbortSignal.any([budget, AbortSignal.timeout(4_000)]);
      const { url, html } = await fetchYoutubePage(LIVE_PAGE, firstAttempt)
        .catch(() => fetchYoutubePage(CHANNEL_LIVE_PAGE, budget));
      const redirectedVideo = youtubeVideoId(url);
      const canonical = html.match(/<link rel="canonical" href="([^"]+)"/i)?.[1];
      const videoId = redirectedVideo ?? (canonical ? youtubeVideoId(canonical) : null);
      let broadcast = videoId ? activeYoutubeBroadcast(html, videoId) : null;

      // Some channel pages contain a video ID before the complete player metadata loads.
      if (videoId && !broadcast && !redirectedVideo) {
        const watch = await fetchYoutubePage("https://www.youtube.com/watch?v=" + videoId, budget);
        broadcast = activeYoutubeBroadcast(watch.html, videoId);
      }
      this.current = { broadcast };
      return this.current;
    } catch {
      this.current = undefined;
      throw new ServiceUnavailableException("Não foi possível consultar o canal do YouTube.");
    }
  }
}

@Controller("public/youtube-live")
export class YoutubeLiveController {
  constructor(private readonly live: YoutubeLiveService) {}

  @Public()
  @Get()
  status() {
    return this.live.getStatus();
  }
}
