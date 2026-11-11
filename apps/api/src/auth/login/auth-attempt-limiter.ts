import {
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { PrismaService } from "../../prisma/prisma.service";
import { AuthClock } from "../session/auth-clock";

export const RATE_LIMIT_MESSAGE = "Muitas tentativas — aguarde e tente de novo";

export interface AuthAttemptLimiter {
  assertAllowed(key: string, limit: number, windowMs: number): Promise<void>;
  recordFailure(key: string, windowMs: number): Promise<void>;
  reset(key: string): Promise<void>;
}

interface Bucket {
  failures: number;
  resetAt: number;
}

@Injectable()
export class InMemoryAuthAttemptLimiter implements AuthAttemptLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly clock: AuthClock = new AuthClock()) {}

  async assertAllowed(key: string, limit: number, windowMs: number): Promise<void> {
    this.purge(windowMs);
    const bucket = this.buckets.get(key);
    if (bucket && bucket.resetAt > this.clock.now() && bucket.failures >= limit) {
      throw rateLimited();
    }
  }

  async recordFailure(key: string, windowMs: number): Promise<void> {
    const now = this.clock.now();
    const current = this.buckets.get(key);
    if (!current || current.resetAt <= now) {
      this.buckets.set(key, { failures: 1, resetAt: now + windowMs });
      return;
    }
    current.failures += 1;
  }

  async reset(key: string): Promise<void> {
    this.buckets.delete(key);
  }

  private purge(windowMs: number): void {
    if (this.buckets.size < 5000) {
      return;
    }
    const now = this.clock.now();
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now - windowMs) {
        this.buckets.delete(key);
      }
    }
  }
}

/**
 * Persistência proposta para o integrador (#189), tabela `auth_attempt_windows`.
 * Falha fechada: erro de banco vira 503, nunca libera a tentativa.
 * A chave já é fingerprint; a SQL não recebe e-mail nem senha.
 */
@Injectable()
export class PrismaAuthAttemptLimiter implements AuthAttemptLimiter {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: AuthClock = new AuthClock(),
  ) {}

  async assertAllowed(key: string, limit: number, windowMs: number): Promise<void> {
    let rows: AttemptRow[];
    try {
      rows = await this.prisma.$queryRaw<AttemptRow[]>`
        SELECT failures, window_started_at
        FROM auth_attempt_windows
        WHERE bucket_key = ${key}
      `;
    } catch (error) {
      throw storageDown(error);
    }
    const row = rows[0];
    if (!row) {
      return;
    }
    const started = toMillis(row.window_started_at);
    if (row.failures >= limit && started + windowMs > this.clock.now()) {
      throw rateLimited();
    }
  }

  async recordFailure(key: string, windowMs: number): Promise<void> {
    const now = new Date(this.clock.now());
    const cutoff = new Date(this.clock.now() - windowMs);
    try {
      await this.prisma.$executeRaw`
        INSERT INTO auth_attempt_windows (bucket_key, failures, window_started_at, updated_at)
        VALUES (${key}, 1, ${now}, ${now})
        ON CONFLICT (bucket_key) DO UPDATE
        SET failures = CASE
              WHEN auth_attempt_windows.window_started_at <= ${cutoff} THEN 1
              ELSE auth_attempt_windows.failures + 1
            END,
            window_started_at = CASE
              WHEN auth_attempt_windows.window_started_at <= ${cutoff} THEN ${now}
              ELSE auth_attempt_windows.window_started_at
            END,
            updated_at = ${now}
      `;
    } catch (error) {
      throw storageDown(error);
    }
  }

  async reset(key: string): Promise<void> {
    try {
      await this.prisma.$executeRaw`
        DELETE FROM auth_attempt_windows WHERE bucket_key = ${key}
      `;
    } catch (error) {
      throw storageDown(error);
    }
  }
}

interface AttemptRow {
  failures: number;
  window_started_at: Date | string;
}

function toMillis(value: Date | string): number {
  if (value instanceof Date) {
    return value.getTime();
  }
  return new Date(value).getTime();
}

function rateLimited(): HttpException {
  return new HttpException(
    {
      statusCode: HttpStatus.TOO_MANY_REQUESTS,
      message: RATE_LIMIT_MESSAGE,
      code: "RATE_LIMITED",
    },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}

function storageDown(error: unknown): ServiceUnavailableException {
  if (error instanceof HttpException) {
    throw error;
  }
  return new ServiceUnavailableException("Verificação indisponível");
}
