export interface MetricCount {
  count: number;
  ratio?: number;
  perMinute?: number;
}

export interface MetricsSnapshot {
  since: string;
  uptimeSec: number;
  requests: number;
  latencyMs: { p50: number | null; p95: number | null };
  http5xx: { count: number; ratio: number };
  http401: { count: number; perMinute: number };
  http403: { count: number; perMinute: number };
  http429: { count: number; perMinute: number };
  readiness: { ok: number; unavailable: number; lastOk: boolean | null };
  metricsDenied: number;
}

/** Percentil nearest-rank. Janela vazia devolve null, sem inventar zero. */
export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[rank] ?? null;
}

/**
 * Contadores do processo e uma janela circular de latências.
 * Não guarda rota, IP, usuário nem corpo.
 */
export class MetricsRegistry {
  private readonly startedAt: number;
  private readonly samples: number[] = [];
  private cursor = 0;
  private requests = 0;
  private http5xx = 0;
  private http401 = 0;
  private http403 = 0;
  private http429 = 0;
  private readyOk = 0;
  private readyFail = 0;
  private lastReady: boolean | null = null;
  private metricsDenied = 0;

  constructor(
    private readonly clock: () => number = Date.now,
    private readonly capacity = 512,
  ) {
    this.startedAt = this.clock();
  }

  recordRequest(status: number, durationMs: number): void {
    this.requests += 1;
    if (status >= 500) this.http5xx += 1;
    else if (status === 401) this.http401 += 1;
    else if (status === 403) this.http403 += 1;
    else if (status === 429) this.http429 += 1;
    if (this.samples.length < this.capacity) {
      this.samples.push(durationMs);
      return;
    }
    this.samples[this.cursor] = durationMs;
    this.cursor = (this.cursor + 1) % this.capacity;
  }

  recordReadiness(ok: boolean): void {
    this.lastReady = ok;
    if (ok) this.readyOk += 1;
    else this.readyFail += 1;
  }

  recordMetricsDenied(): void {
    this.metricsDenied += 1;
  }

  snapshot(): MetricsSnapshot {
    const now = this.clock();
    const uptimeSec = Math.max(0, Math.round((now - this.startedAt) / 1000));
    const minutes = Math.max((now - this.startedAt) / 60_000, 1 / 60);
    const requests = this.requests;
    return {
      since: new Date(this.startedAt).toISOString(),
      uptimeSec,
      requests,
      latencyMs: {
        p50: percentile(this.samples, 0.5),
        p95: percentile(this.samples, 0.95),
      },
      http5xx: {
        count: this.http5xx,
        ratio: requests === 0 ? 0 : this.http5xx / requests,
      },
      http401: { count: this.http401, perMinute: this.http401 / minutes },
      http403: { count: this.http403, perMinute: this.http403 / minutes },
      http429: { count: this.http429, perMinute: this.http429 / minutes },
      readiness: {
        ok: this.readyOk,
        unavailable: this.readyFail,
        lastOk: this.lastReady,
      },
      metricsDenied: this.metricsDenied,
    };
  }
}
