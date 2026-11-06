import { Injectable } from "@nestjs/common";
import type { CommChannel } from "./providers/channel-provider";

type Bucket = { count: number; resetAt: number };

export type ChannelRateLimitSnapshot = {
  channel: CommChannel;
  limit: number;
  windowMs: number;
  used: number;
  remaining: number;
  resetAt: string | null;
};

/**
 * Rate limit in-memory por canal (single-node DEV/HML).
 * Não substitui fila Redis / gateway em PRD.
 */
@Injectable()
export class ChannelRateLimitService {
  private readonly buckets = new Map<string, Bucket>();

  private configFor(channel: CommChannel): { limit: number; windowMs: number } {
    const prefix =
      channel === "WHATSAPP"
        ? "CHANNELS_WHATSAPP"
        : channel === "EMAIL"
          ? "CHANNELS_EMAIL"
          : "CHANNELS_PUSH";
    const defaults =
      channel === "WHATSAPP"
        ? { limit: 20, windowMs: 60_000 }
        : channel === "EMAIL"
          ? { limit: 60, windowMs: 60_000 }
          : { limit: 120, windowMs: 60_000 };
    return {
      limit: Number(process.env[`${prefix}_RATE_MAX`] ?? defaults.limit),
      windowMs: Number(
        process.env[`${prefix}_RATE_WINDOW_MS`] ?? defaults.windowMs,
      ),
    };
  }

  /** Reserva 1 slot; retorna false se estourar o limite. */
  tryConsume(channel: CommChannel, churchId: string): boolean {
    const { limit, windowMs } = this.configFor(channel);
    const key = `${channel}:${churchId}`;
    const now = Date.now();
    const current = this.buckets.get(key);
    if (!current || current.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    if (current.count >= limit) return false;
    current.count += 1;
    return true;
  }

  snapshot(channel: CommChannel, churchId: string): ChannelRateLimitSnapshot {
    const { limit, windowMs } = this.configFor(channel);
    const key = `${channel}:${churchId}`;
    const now = Date.now();
    const current = this.buckets.get(key);
    if (!current || current.resetAt <= now) {
      return {
        channel,
        limit,
        windowMs,
        used: 0,
        remaining: limit,
        resetAt: null,
      };
    }
    return {
      channel,
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
