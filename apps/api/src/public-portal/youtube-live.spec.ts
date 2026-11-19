import { activeYoutubeBroadcast, YoutubeLiveService } from "./youtube-live";

const videoId = "74n2caqxcWo";
const channel = "UCpd6-RQKVIKfje5usHzYiiA";
const watchUrl = "https://www.youtube.com/watch?v=" + videoId;

function page({ active = true, ended = false, owner = channel, embeddable = true } = {}) {
  const data = {
    videoDetails: { videoId, channelId: owner, title: "Culto da Família" },
    microformat: { playerMicroformatRenderer: { liveBroadcastDetails: {
      isLiveNow: active, endTimestamp: ended ? "2026-11-19T22:00:00Z" : undefined,
    } } },
    playabilityStatus: { status: "OK", playableInEmbed: embeddable },
  };
  return "<script>var ytInitialPlayerResponse = " + JSON.stringify(data) + ";</script>";
}

function response(body: string | null, url: string, status = 200) {
  const result = new Response(body, { status });
  Object.defineProperty(result, "url", { value: url });
  return result;
}

describe("Culto ao vivo no portal", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it("aceita apenas a live em andamento do canal oficial", () => {
    expect(activeYoutubeBroadcast(page(), videoId)).toEqual({ id: videoId, title: "Culto da Família", embeddable: true });
    expect(activeYoutubeBroadcast(page({ embeddable: false }), videoId)?.embeddable).toBe(false);
    expect(activeYoutubeBroadcast(page({ active: false }), videoId)).toBeNull();
    expect(activeYoutubeBroadcast(page({ ended: true }), videoId)).toBeNull();
    expect(activeYoutubeBroadcast(page({ owner: "another-channel" }), videoId)).toBeNull();
    expect(activeYoutubeBroadcast(page(), "lTjvE8G_YAE")).toBeNull();
  });

  it("segue a URL canônica de um player servido sem redirecionamento", async () => {
    const livePage = "https://www.youtube.com/channel/" + channel + "/live";
    const fetcher = jest.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response('<link rel="canonical" href="' + watchUrl + '">', livePage))
      .mockResolvedValueOnce(response(page(), watchUrl));
    await expect(new YoutubeLiveService().getStatus()).resolves.toMatchObject({ broadcast: { id: videoId } });
    expect(fetcher).toHaveBeenNthCalledWith(2, watchUrl, expect.anything());
  });

  it("consulta pelo ID oficial do canal se a URL personalizada responder com erro", async () => {
    const customUrl = "https://www.youtube.com/c/IDBRiachoFundo1IDB/live";
    const canonicalUrl = "https://www.youtube.com/channel/" + channel + "/live";
    const fetcher = jest.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response(null, customUrl, 503))
      .mockResolvedValueOnce(response(page(), watchUrl));
    await expect(new YoutubeLiveService().getStatus()).resolves.toMatchObject({ broadcast: { id: videoId } });
    expect(fetcher).toHaveBeenNthCalledWith(1, customUrl, expect.anything());
    expect(fetcher).toHaveBeenNthCalledWith(2, canonicalUrl, expect.anything());
  });

  it("confirma o estado do vídeo mais recente do feed quando as páginas do canal falham", async () => {
    const feed = '<entry><yt:videoId>' + videoId + '</yt:videoId><yt:channelId>' + channel +
      '</yt:channelId><title>Culto da Família</title><published>2026-11-01T11:00:00Z</published></entry>';
    const fetcher = jest.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response(null, watchUrl, 503))
      .mockResolvedValueOnce(response(null, watchUrl, 503))
      .mockResolvedValueOnce(response(feed, "https://www.youtube.com/feeds/videos.xml"))
      .mockResolvedValueOnce(response(page({active:false}), watchUrl));
    await expect(new YoutubeLiveService().getStatus()).resolves.toEqual({ broadcast: null });
    expect(fetcher).toHaveBeenNthCalledWith(4, "https://www.youtube.com/live/" + videoId, expect.anything());
  });

  it("remove o destaque após o encerramento e em erro de consulta", async () => {
    jest.useFakeTimers();
    const fetcher = jest.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response(page(), watchUrl))
      .mockResolvedValueOnce(response(null, "https://www.youtube.com/channel/" + channel + "/live"))
      .mockResolvedValueOnce(response(null, watchUrl, 503))
      .mockResolvedValueOnce(response(null, watchUrl, 503));
    const service = new YoutubeLiveService();
    const [active, concurrent] = await Promise.all([service.getStatus(), service.getStatus()]);
    expect(active.broadcast?.id).toBe(videoId);
    expect(concurrent).toEqual(active);
    expect(fetcher).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(30_000);
    await expect(service.getStatus()).resolves.toEqual({ broadcast: null });
    jest.advanceTimersByTime(30_000);
    await expect(service.getStatus()).rejects.toMatchObject({ status: 503 });
  });
});
