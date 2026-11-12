import { hashOpaqueToken } from "./token";

export interface RateLimitDecision {
  allowed: boolean;
  hits: number;
  retryAtMs: number;
}

export interface RateLimitStore {
  hit(input: {
    key: string;
    limit: number;
    windowMs: number;
    now: number;
  }): Promise<RateLimitDecision>;
}

interface Bucket {
  hits: number;
  windowStartMs: number;
}

export class MemoryRateLimitStore implements RateLimitStore {
  readonly buckets = new Map<string, Bucket>();

  async hit(input: {
    key: string;
    limit: number;
    windowMs: number;
    now: number;
  }): Promise<RateLimitDecision> {
    if (!Number.isFinite(input.limit) || input.limit < 1) {
      throw new Error("Limite de taxa inválido");
    }
    if (!Number.isFinite(input.windowMs) || input.windowMs < 1) {
      throw new Error("Janela de taxa inválida");
    }
    const keyHash = hashOpaqueToken(input.key);
    const windowStartMs = Math.floor(input.now / input.windowMs) * input.windowMs;
    const current = this.buckets.get(keyHash);
    const bucket =
      !current || current.windowStartMs !== windowStartMs
        ? { hits: 0, windowStartMs }
        : current;
    bucket.hits += 1;
    this.buckets.set(keyHash, bucket);
    return {
      allowed: bucket.hits <= input.limit,
      hits: bucket.hits,
      retryAtMs: windowStartMs + input.windowMs,
    };
  }
}
