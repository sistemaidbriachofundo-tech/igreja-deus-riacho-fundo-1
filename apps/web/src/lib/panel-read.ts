/**
 * Leituras do painel administrativo.
 * Chamadas iguais em voo viram uma só. Sucesso recente é reutilizado por pouco tempo.
 * Falha, 401 e 403 não ficam em cache: a próxima leitura volta a perguntar à API.
 */

const FRESH_MS = 15_000;

type Entry = { at: number; data: unknown };

const fresh = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

function keyOf(token: string, path: string): string {
  return `${token}\n${path}`;
}

export function clearPanelReads(): void {
  fresh.clear();
  inflight.clear();
}

export function readPanel<T>(
  token: string,
  path: string,
  load: () => Promise<T>,
  options?: { fresh?: boolean },
): Promise<T> {
  const key = keyOf(token, path);
  if (!options?.fresh) {
    const hit = fresh.get(key);
    if (hit && Date.now() - hit.at < FRESH_MS) return Promise.resolve(hit.data as T);
    const pending = inflight.get(key);
    if (pending) return pending as Promise<T>;
  }
  const job = load()
    .then(data => {
      fresh.set(key, { at: Date.now(), data });
      inflight.delete(key);
      return data;
    })
    .catch((error: unknown) => {
      inflight.delete(key);
      throw error;
    });
  inflight.set(key, job);
  return job;
}
