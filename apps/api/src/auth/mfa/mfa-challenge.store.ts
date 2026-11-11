import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import type { PrismaService } from "../../prisma/prisma.service";
import { AuthClock } from "../session/auth-clock";
import { utcTimestamp } from "../session/utc-timestamp";
import {
  digestPresentedId,
  isPresentedId,
  newPresentedId,
} from "../session/session-store";

export type MfaChallengePurpose = "totp" | "enroll";

export interface MfaChallengeRecord {
  userId: string;
  purpose: MfaChallengePurpose;
  expiresAtMs: number;
  consumedAtMs: number | null;
  attempts: number;
  reads: number;
}

export interface MfaChallengeStore {
  create(input: {
    userId: string;
    purpose: MfaChallengePurpose;
    expiresAtMs: number;
  }): Promise<{ challengeId: string }>;
  get(challengeId: string): Promise<MfaChallengeRecord | null>;
  recordFailure(
    challengeId: string,
    maxAttempts: number,
  ): Promise<{ burned: boolean }>;
  recordRead(challengeId: string, maxReads: number): Promise<{ burned: boolean }>;
  /** Uso único. A segunda chamada do mesmo id devolve replay. */
  consume(challengeId: string): Promise<"ok" | "replay" | "missing" | "expired">;
}

@Injectable()
export class InMemoryMfaChallengeStore implements MfaChallengeStore {
  private readonly rows = new Map<string, MfaChallengeRecord>();

  constructor(private readonly clock: AuthClock = new AuthClock()) {}

  async create(input: {
    userId: string;
    purpose: MfaChallengePurpose;
    expiresAtMs: number;
  }): Promise<{ challengeId: string }> {
    this.purge();
    const challengeId = newPresentedId();
    this.rows.set(digestPresentedId(challengeId), {
      userId: input.userId,
      purpose: input.purpose,
      expiresAtMs: input.expiresAtMs,
      consumedAtMs: null,
      attempts: 0,
      reads: 0,
    });
    return { challengeId };
  }

  async get(challengeId: string): Promise<MfaChallengeRecord | null> {
    const row = this.lookup(challengeId);
    return row ? { ...row } : null;
  }

  async recordFailure(
    challengeId: string,
    maxAttempts: number,
  ): Promise<{ burned: boolean }> {
    const row = this.lookup(challengeId);
    if (!row || row.consumedAtMs) {
      return { burned: true };
    }
    row.attempts += 1;
    if (row.attempts >= maxAttempts) {
      row.consumedAtMs = this.clock.now();
      return { burned: true };
    }
    return { burned: false };
  }

  async recordRead(challengeId: string, maxReads: number): Promise<{ burned: boolean }> {
    const row = this.lookup(challengeId);
    if (!row || row.consumedAtMs) {
      return { burned: true };
    }
    row.reads += 1;
    if (row.reads > maxReads) {
      row.consumedAtMs = this.clock.now();
      return { burned: true };
    }
    return { burned: false };
  }

  async consume(
    challengeId: string,
  ): Promise<"ok" | "replay" | "missing" | "expired"> {
    const row = this.lookup(challengeId);
    if (!row) {
      return "missing";
    }
    if (row.consumedAtMs) {
      return "replay";
    }
    if (row.expiresAtMs <= this.clock.now()) {
      return "expired";
    }
    row.consumedAtMs = this.clock.now();
    return "ok";
  }

  private lookup(challengeId: string): MfaChallengeRecord | null {
    if (!isPresentedId(challengeId)) {
      return null;
    }
    return this.rows.get(digestPresentedId(challengeId)) ?? null;
  }

  private purge(): void {
    if (this.rows.size < 5000) {
      return;
    }
    const now = this.clock.now();
    for (const [key, row] of this.rows) {
      if ((row.consumedAtMs ?? row.expiresAtMs) < now) {
        this.rows.delete(key);
      }
    }
  }
}

@Injectable()
export class PrismaMfaChallengeStore implements MfaChallengeStore {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: AuthClock = new AuthClock(),
  ) {}

  async create(input: {
    userId: string;
    purpose: MfaChallengePurpose;
    expiresAtMs: number;
  }): Promise<{ challengeId: string }> {
    const challengeId = newPresentedId();
    try {
      const id = digestPresentedId(challengeId);
      const purpose = input.purpose === "totp" ? "LOGIN" : "STEP_UP";
      await this.prisma.$executeRaw`
        INSERT INTO mfa_challenges (
          id, user_id, purpose, status, token_hash, challenge_kind,
          expires_at, attempt_count, max_attempts, reads, created_at
        ) VALUES (
          ${id},
          ${input.userId},
          ${purpose}::"MfaChallengePurpose",
          'PENDING',
          ${id},
          ${input.purpose},
          ${utcTimestamp(new Date(input.expiresAtMs))},
          0,
          5,
          0,
          ${utcTimestamp(new Date(this.clock.now()))}
        )
      `;
    } catch {
      throw new ServiceUnavailableException("Verificação indisponível");
    }
    return { challengeId };
  }

  async get(challengeId: string): Promise<MfaChallengeRecord | null> {
    if (!isPresentedId(challengeId)) {
      return null;
    }
    let rows: ChallengeRow[];
    try {
      rows = await this.prisma.$queryRaw<ChallengeRow[]>`
        SELECT user_id, challenge_kind, expires_at, consumed_at, attempt_count, reads
        FROM mfa_challenges
        WHERE id = ${digestPresentedId(challengeId)}
      `;
    } catch {
      throw new ServiceUnavailableException("Verificação indisponível");
    }
    const row = rows[0];
    if (!row || (row.challenge_kind !== "totp" && row.challenge_kind !== "enroll")) {
      return null;
    }
    return {
      userId: row.user_id,
      purpose: row.challenge_kind,
      expiresAtMs: toMillis(row.expires_at),
      consumedAtMs: row.consumed_at ? toMillis(row.consumed_at) : null,
      attempts: Number(row.attempt_count),
      reads: Number(row.reads),
    };
  }

  async recordFailure(
    challengeId: string,
    maxAttempts: number,
  ): Promise<{ burned: boolean }> {
    const current = await this.get(challengeId);
    if (!current || current.consumedAtMs) {
      return { burned: true };
    }
    const attempts = current.attempts + 1;
    const burned = attempts >= maxAttempts;
    try {
      await this.prisma.$executeRaw`
        UPDATE mfa_challenges
        SET attempt_count = ${attempts},
            status = ${burned ? "CONSUMED" : "PENDING"}::"MfaChallengeStatus",
            consumed_at = ${utcTimestamp(burned ? new Date(this.clock.now()) : null)}
        WHERE id = ${digestPresentedId(challengeId)}
          AND consumed_at IS NULL
      `;
    } catch {
      throw new ServiceUnavailableException("Verificação indisponível");
    }
    return { burned };
  }

  async recordRead(challengeId: string, maxReads: number): Promise<{ burned: boolean }> {
    const current = await this.get(challengeId);
    if (!current || current.consumedAtMs) {
      return { burned: true };
    }
    const reads = current.reads + 1;
    const burned = reads > maxReads;
    try {
      await this.prisma.$executeRaw`
        UPDATE mfa_challenges
        SET reads = ${reads},
            status = ${burned ? "CONSUMED" : "PENDING"}::"MfaChallengeStatus",
            consumed_at = ${utcTimestamp(burned ? new Date(this.clock.now()) : null)}
        WHERE id = ${digestPresentedId(challengeId)}
          AND consumed_at IS NULL
      `;
    } catch {
      throw new ServiceUnavailableException("Verificação indisponível");
    }
    return { burned };
  }

  async consume(
    challengeId: string,
  ): Promise<"ok" | "replay" | "missing" | "expired"> {
    const current = await this.get(challengeId);
    if (!current) {
      return "missing";
    }
    if (current.consumedAtMs) {
      return "replay";
    }
    if (current.expiresAtMs <= this.clock.now()) {
      return "expired";
    }
    try {
      const updated = await this.prisma.$executeRaw`
        UPDATE mfa_challenges
        SET status = 'CONSUMED',
            consumed_at = ${utcTimestamp(new Date(this.clock.now()))}
        WHERE id = ${digestPresentedId(challengeId)}
          AND consumed_at IS NULL
      `;
      if (Number(updated) < 1) {
        return "replay";
      }
    } catch {
      throw new ServiceUnavailableException("Verificação indisponível");
    }
    return "ok";
  }
}

interface ChallengeRow {
  user_id: string;
  challenge_kind: string;
  expires_at: Date | string;
  consumed_at: Date | string | null;
  attempt_count: number;
  reads: number;
}

function toMillis(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}
