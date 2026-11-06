import { Injectable } from "@nestjs/common";

type Bucket = { count: number; resetAt: number };

export type ViviRateLimitSnapshot = {
  scope: "public" | "admin";
  limit: number;
  windowMs: number;
  used: number;
  remaining: number;
  resetAt: string | null;
};

/**
 * Rate limit in-memory da Vivi (single-node DEV/HML).
 * Público: limite forte (default 8/min). Admin: mais folgado (default 60/min).
 */
@Injectable()
export class ViviRateLimitService {
  private readonly buckets = new Map<string, Bucket>();

  private configFor(scope: "public" | "admin"): {
    limit: number;
    windowMs: number;
  } {
    if (scope === "public") {
      return {
        limit: Number(process.env.VIVI_PUBLIC_RATE_MAX ?? 8),
        windowMs: Number(process.env.VIVI_PUBLIC_RATE_WINDOW_MS ?? 60_000),
      };
    }
    return {
      limit: Number(process.env.VIVI_ADMIN_RATE_MAX ?? 60),
      windowMs: Number(process.env.VIVI_ADMIN_RATE_WINDOW_MS ?? 60_000),
    };
  }

  /** Reserva 1 slot; false se estourar. */
  tryConsume(scope: "public" | "admin", key: string): boolean {
    const { limit, windowMs } = this.configFor(scope);
    const bucketKey = `${scope}:${key}`;
    const now = Date.now();
    const current = this.buckets.get(bucketKey);
    if (!current || current.resetAt <= now) {
      this.buckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
      return true;
    }
    if (current.count >= limit) return false;
    current.count += 1;
    return true;
  }

  snapshot(scope: "public" | "admin", key: string): ViviRateLimitSnapshot {
    const { limit, windowMs } = this.configFor(scope);
    const bucketKey = `${scope}:${key}`;
    const now = Date.now();
    const current = this.buckets.get(bucketKey);
    if (!current || current.resetAt <= now) {
      return {
        scope,
        limit,
        windowMs,
        used: 0,
        remaining: limit,
        resetAt: null,
      };
    }
    return {
      scope,
      limit,
      windowMs,
      used: current.count,
      remaining: Math.max(0, limit - current.count),
      resetAt: new Date(current.resetAt).toISOString(),
    };
  }

  /** Só para testes. */
  reset(): void {
    this.buckets.clear();
  }
}
