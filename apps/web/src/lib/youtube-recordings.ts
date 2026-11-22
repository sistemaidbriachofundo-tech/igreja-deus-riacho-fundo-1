type Recording = { id: string; title: string; date?: string };

export const latestKnownRecordings: Recording[] = [
  { id: "OXywPv_LoQQ", title: "Quinta do Encontro - 19/11/26", date: "19/11/2026" },
  { id: "74n2caqxcWo", title: "Quinta do Encontro", date: "12/11/2026" },
  { id: "lTjvE8G_YAE", title: "Culto de Santa Ceia", date: "08/11/2026" },
  { id: "yX1M_taAniQ", title: "Culto de Santa Ceia da manhã", date: "08/11/2026" },
];

export function parseYoutubeRecordings(payload: unknown): Recording[] | null {
  if (!payload || typeof payload !== "object" || !("recordings" in payload) || !Array.isArray(payload.recordings)) return null;
  const recordings = payload.recordings.flatMap((item: unknown) => {
    if (!item || typeof item !== "object" || !("id" in item) || !("title" in item)) return [];
    const { id, title } = item;
    if (typeof id !== "string" || !/^[\w-]{11}$/.test(id) || typeof title !== "string" || !title.trim()) return [];
    const known = latestKnownRecordings.find(video => video.id === id);
    return [known ?? { id, title: title.trim() }];
  });
  return recordings.length ? recordings : null;
}
