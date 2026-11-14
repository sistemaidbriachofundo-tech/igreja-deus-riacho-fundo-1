import { parseYoutubeStreams, YoutubeStreamsService } from "./youtube-streams.controller";

const CHANNEL = "UCpd6-RQKVIKfje5usHzYiiA";
const entry = (id: string, title: string, date: string, channel = CHANNEL) =>
  `<entry><yt:videoId>${id}</yt:videoId><yt:channelId>${channel}</yt:channelId><title>${title}</title><published>${date}</published></entry>`;
const recording = entry("74n2caqxcWo", "Quinta do Encontro", "2026-11-13T12:36:13Z");

describe("Gravações do canal IDBRiacho", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it("ordena por publicação, decodifica o título e filtra entradas inválidas ou de outro canal", () => {
    const xml = [
      entry("lTjvE8G_YAE", "Santa Ceia", "2026-11-09T12:34:10Z"),
      entry("74n2caqxcWo", "Palavra &amp; ora&#231;&#227;o", "2026-11-13T12:36:13Z"),
      recording,
      entry("otherVideo1", "Outro canal", "2026-11-14T12:00:00Z", "UCOtherChannel"),
      entry("futureVideo", "Próxima live", "2026-11-15T12:00:00Z"),
      entry("invalidDate", "Data inválida", "invalid"),
    ].join("");
    expect(parseYoutubeStreams(xml, Date.parse("2026-11-14T14:00:00Z"))).toEqual([
      { id: "74n2caqxcWo", title: "Palavra & oração", publishedAt: "2026-11-13T12:36:13.000Z" },
      { id: "lTjvE8G_YAE", title: "Santa Ceia", publishedAt: "2026-11-09T12:34:10.000Z" },
    ]);
  });

  it("compartilha a consulta e mantém a última lista durante uma falha temporária", async () => {
    jest.useFakeTimers({ now: new Date("2026-11-14T14:00:00Z") });
    const fetcher = jest.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(recording))
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    const service = new YoutubeStreamsService();
    const [first, second] = await Promise.all([service.list(), service.list()]);
    expect(first).toEqual(second);
    expect(first.recordings[0].id).toBe("74n2caqxcWo");
    expect(fetcher).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(5 * 60_000 + 1);
    await expect(service.list()).resolves.toEqual(first);
    await expect(service.list()).resolves.toEqual(first);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
