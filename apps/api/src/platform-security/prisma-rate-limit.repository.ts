import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { hashOpaqueToken, type RateLimitDecision, type RateLimitStore } from "@idbrf/shared";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class PrismaRateLimitStore implements RateLimitStore {
  constructor(private readonly prisma: PrismaService) {}

  async hit(input: {
    key: string;
    limit: number;
    windowMs: number;
    now: number;
  }): Promise<RateLimitDecision> {
    if (!Number.isFinite(input.limit) || input.limit < 1 || !Number.isFinite(input.windowMs) || input.windowMs < 1) {
      throw new Error("Limite de taxa inválido");
    }
    const keyHash = hashOpaqueToken(input.key);
    const windowStartMs = Math.floor(input.now / input.windowMs) * input.windowMs;
    const expiresAt = new Date(windowStartMs + input.windowMs);
    const rows = await this.prisma.$queryRaw<Array<{ hits: number }>>`
      INSERT INTO rate_limit_buckets (id, key_hash, window_start, hits, expires_at, updated_at)
      VALUES (${randomUUID()}, ${keyHash}, ${new Date(windowStartMs)}, 1, ${expiresAt}, NOW())
      ON CONFLICT (key_hash, window_start)
      DO UPDATE SET hits = rate_limit_buckets.hits + 1, updated_at = NOW()
      RETURNING hits
    `;
    const hits = Number(rows[0]?.hits ?? 1);
    return {
      allowed: hits <= input.limit,
      hits,
      retryAtMs: expiresAt.getTime(),
    };
  }
}
