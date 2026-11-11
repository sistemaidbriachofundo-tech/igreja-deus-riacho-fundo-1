import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import type { PrismaService } from "../../prisma/prisma.service";
import { AuthClock } from "../session/auth-clock";
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
      await this.prisma.$executeRaw`
        INSERT INTO auth_mfa_challenges (
          id, user_id, purpose, expires_at, attempts, reads, created_at
        ) VALUES (
          ${digestPresentedId(challengeId)},
          ${input.userId},
          ${input.purpose},
          ${new Date(input.expiresAtMs)},
          0,
          0,
          ${new Date(this.clock.now())}
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
        SELECT user_id, purpose, expires_at, consumed_at, attempts, reads
        FROM auth_mfa_challenges
        WHERE id = ${digestPresentedId(challengeId)}
      `;
    } catch {
      throw new ServiceUnavailableException("Verificação indisponível");
    }
    const row = rows[0];
    if (!row || (row.purpose !== "totp" && row.purpose !== "enroll")) {
      return null;
    }
    return {
      userId: row.user_id,
      purpose: row.purpose,
      expiresAtMs: toMillis(row.expires_at),
      consumedAtMs: row.consumed_at ? toMillis(row.consumed_at) : null,
      attempts: Number(row.attempts),
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
        UPDATE auth_mfa_challenges
        SET attempts = ${attempts},
            consumed_at = ${burned ? new Date(this.clock.now()) : null}
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
        UPDATE auth_mfa_challenges
        SET reads = ${reads},
            consumed_at = ${burned ? new Date(this.clock.now()) : null}
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
        UPDATE auth_mfa_challenges
        SET consumed_at = ${new Date(this.clock.now())}
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
  purpose: string;
  expires_at: Date | string;
  consumed_at: Date | string | null;
  attempts: number;
  reads: number;
}

function toMillis(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}
