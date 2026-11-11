import { generateOpaqueToken, hashOpaqueToken } from "./token";

export type MfaChallengePurpose = "LOGIN" | "REFRESH" | "SWITCH_CHURCH" | "STEP_UP";
export type MfaChallengeStatus = "PENDING" | "CONSUMED" | "EXPIRED" | "REVOKED";

export interface MfaChallengeRecord {
  id: string;
  userId: string;
  purpose: MfaChallengePurpose;
  status: MfaChallengeStatus;
  tokenHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  attemptCount: number;
  maxAttempts: number;
}

export type MfaChallengeFailure = "not_found" | "replay" | "expired" | "revoked" | "attempts";

export interface MfaChallengeRepository {
  insert(row: MfaChallengeRecord): Promise<void>;
  findByTokenHash(hash: string): Promise<MfaChallengeRecord | null>;
  consumePending(hash: string, now: Date): Promise<number>;
  registerFailure(hash: string, now: Date): Promise<MfaChallengeRecord | null>;
}

export class MemoryMfaChallengeRepository implements MfaChallengeRepository {
  readonly rows = new Map<string, MfaChallengeRecord>();

  async insert(row: MfaChallengeRecord): Promise<void> {
    this.rows.set(row.tokenHash, { ...row });
  }

  async findByTokenHash(hash: string): Promise<MfaChallengeRecord | null> {
    const row = this.rows.get(hash);
    return row ? { ...row } : null;
  }

  async consumePending(hash: string, now: Date): Promise<number> {
    const row = this.rows.get(hash);
    if (!row || row.status !== "PENDING") return 0;
    if (row.expiresAt.getTime() <= now.getTime()) {
      row.status = "EXPIRED";
      return 0;
    }
    if (row.attemptCount >= row.maxAttempts) {
      row.status = "REVOKED";
      return 0;
    }
    row.status = "CONSUMED";
    row.consumedAt = now;
    return 1;
  }

  async registerFailure(hash: string, now: Date): Promise<MfaChallengeRecord | null> {
    const row = this.rows.get(hash);
    if (!row) return null;
    if (row.status !== "PENDING") return { ...row };
    if (row.expiresAt.getTime() <= now.getTime()) {
      row.status = "EXPIRED";
      return { ...row };
    }
    row.attemptCount += 1;
    if (row.attemptCount >= row.maxAttempts) row.status = "REVOKED";
    return { ...row };
  }
}

export class MfaChallengeService {
  constructor(private readonly repo: MfaChallengeRepository) {}

  async issue(input: {
    userId: string;
    purpose: MfaChallengePurpose;
    ttlMs: number;
    maxAttempts?: number;
    now?: Date;
  }): Promise<{ challenge: MfaChallengeRecord; token: string }> {
    const now = input.now ?? new Date();
    const token = generateOpaqueToken();
    const challenge: MfaChallengeRecord = {
      id: generateOpaqueToken(),
      userId: input.userId,
      purpose: input.purpose,
      status: "PENDING",
      tokenHash: hashOpaqueToken(token),
      expiresAt: new Date(now.getTime() + input.ttlMs),
      consumedAt: null,
      attemptCount: 0,
      maxAttempts: input.maxAttempts ?? 5,
    };
    await this.repo.insert(challenge);
    return { challenge, token };
  }

  async consume(
    token: string,
    now = new Date(),
  ): Promise<
    | { ok: true; challenge: MfaChallengeRecord }
    | { ok: false; reason: MfaChallengeFailure }
  > {
    const hash = hashOpaqueToken(token);
    const consumed = await this.repo.consumePending(hash, now);
    const row = await this.repo.findByTokenHash(hash);
    if (consumed === 1 && row) return { ok: true, challenge: row };
    if (!row) return { ok: false, reason: "not_found" };
    if (row.status === "CONSUMED") return { ok: false, reason: "replay" };
    if (row.status === "EXPIRED" || row.expiresAt.getTime() <= now.getTime()) {
      return { ok: false, reason: "expired" };
    }
    if (row.status === "REVOKED" || row.attemptCount >= row.maxAttempts) {
      return { ok: false, reason: "attempts" };
    }
    return { ok: false, reason: "revoked" };
  }

  async registerFailure(token: string, now = new Date()): Promise<MfaChallengeFailure | "pending"> {
    const row = await this.repo.registerFailure(hashOpaqueToken(token), now);
    if (!row) return "not_found";
    if (row.status === "CONSUMED") return "replay";
    if (row.status === "EXPIRED") return "expired";
    if (row.status === "REVOKED") return "attempts";
    return "pending";
  }
}
