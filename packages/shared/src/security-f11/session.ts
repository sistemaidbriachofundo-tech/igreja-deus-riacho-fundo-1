import { generateOpaqueToken, hashOpaqueToken } from "./token";

export type AuthSessionStatus = "ACTIVE" | "REVOKED" | "EXPIRED";

export interface SessionRecord {
  id: string;
  userId: string;
  familyId: string;
  status: AuthSessionStatus;
  authzVersion: number;
  policyVersion: number;
  refreshTokenHash: string;
  issuedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  revokeReason: string | null;
  replacedById: string | null;
}

export type SessionFailure =
  | "not_found"
  | "revoked"
  | "expired"
  | "authz_stale"
  | "policy_stale"
  | "replay";

export interface SessionRepository {
  insert(row: SessionRecord): Promise<void>;
  findByRefreshHash(hash: string): Promise<SessionRecord | null>;
  findById(id: string): Promise<SessionRecord | null>;
  compareAndRevoke(
    id: string,
    patch: { revokedAt: Date; revokeReason: string; replacedById: string | null },
  ): Promise<boolean>;
  revokeFamily(familyId: string, reason: string, now: Date): Promise<void>;
  revokeAllForUser(userId: string, reason: string, now: Date): Promise<number>;
}

export interface IssuedSession {
  session: SessionRecord;
  refreshToken: string;
}

export function assessSession(
  session: SessionRecord,
  now: Date,
  userAuthzVersion: number,
  policyVersion: number,
): { ok: true } | { ok: false; reason: Exclude<SessionFailure, "not_found" | "replay"> } {
  if (session.status === "REVOKED") return { ok: false, reason: "revoked" };
  if (session.status === "EXPIRED" || session.expiresAt.getTime() <= now.getTime()) {
    return { ok: false, reason: "expired" };
  }
  if (session.authzVersion !== userAuthzVersion) return { ok: false, reason: "authz_stale" };
  if (session.policyVersion !== policyVersion) return { ok: false, reason: "policy_stale" };
  return { ok: true };
}

export class MemorySessionRepository implements SessionRepository {
  readonly rows = new Map<string, SessionRecord>();

  async insert(row: SessionRecord): Promise<void> {
    this.rows.set(row.id, { ...row });
  }

  async findByRefreshHash(hash: string): Promise<SessionRecord | null> {
    for (const row of this.rows.values()) {
      if (row.refreshTokenHash === hash) return { ...row };
    }
    return null;
  }

  async findById(id: string): Promise<SessionRecord | null> {
    const row = this.rows.get(id);
    return row ? { ...row } : null;
  }

  async compareAndRevoke(
    id: string,
    patch: { revokedAt: Date; revokeReason: string; replacedById: string | null },
  ): Promise<boolean> {
    const row = this.rows.get(id);
    if (!row || row.status !== "ACTIVE") return false;
    row.status = "REVOKED";
    row.revokedAt = patch.revokedAt;
    row.revokeReason = patch.revokeReason;
    row.replacedById = patch.replacedById;
    return true;
  }

  async revokeFamily(familyId: string, reason: string, now: Date): Promise<void> {
    for (const row of this.rows.values()) {
      if (row.familyId === familyId && row.status === "ACTIVE") {
        row.status = "REVOKED";
        row.revokedAt = now;
        row.revokeReason = reason;
      }
    }
  }

  async revokeAllForUser(userId: string, reason: string, now: Date): Promise<number> {
    let count = 0;
    for (const row of this.rows.values()) {
      if (row.userId === userId && row.status === "ACTIVE") {
        row.status = "REVOKED";
        row.revokedAt = now;
        row.revokeReason = reason;
        count += 1;
      }
    }
    return count;
  }
}

export class SessionService {
  constructor(private readonly repo: SessionRepository) {}

  async issue(input: {
    userId: string;
    authzVersion: number;
    policyVersion: number;
    ttlMs: number;
    now?: Date;
  }): Promise<IssuedSession> {
    const now = input.now ?? new Date();
    const refreshToken = generateOpaqueToken();
    const session: SessionRecord = {
      id: generateOpaqueToken(),
      userId: input.userId,
      familyId: generateOpaqueToken(),
      status: "ACTIVE",
      authzVersion: input.authzVersion,
      policyVersion: input.policyVersion,
      refreshTokenHash: hashOpaqueToken(refreshToken),
      issuedAt: now,
      expiresAt: new Date(now.getTime() + input.ttlMs),
      revokedAt: null,
      revokeReason: null,
      replacedById: null,
    };
    await this.repo.insert(session);
    return { session, refreshToken };
  }

  async assertActive(input: {
    refreshToken: string;
    userAuthzVersion: number;
    policyVersion: number;
    now?: Date;
  }): Promise<{ ok: true; session: SessionRecord } | { ok: false; reason: SessionFailure }> {
    const now = input.now ?? new Date();
    const session = await this.repo.findByRefreshHash(hashOpaqueToken(input.refreshToken));
    if (!session) return { ok: false, reason: "not_found" };
    if (session.status !== "ACTIVE") {
      if (session.revokeReason === "rotated" || session.replacedById) {
        await this.repo.revokeFamily(session.familyId, "refresh_replay", now);
        return { ok: false, reason: "replay" };
      }
      return { ok: false, reason: "revoked" };
    }
    const assessment = assessSession(
      session,
      now,
      input.userAuthzVersion,
      input.policyVersion,
    );
    if (!assessment.ok) {
      await this.repo.compareAndRevoke(session.id, {
        revokedAt: now,
        revokeReason: assessment.reason,
        replacedById: null,
      });
      return assessment;
    }
    return { ok: true, session };
  }

  async revoke(sessionId: string, reason: string, now = new Date()): Promise<boolean> {
    return this.repo.compareAndRevoke(sessionId, {
      revokedAt: now,
      revokeReason: reason,
      replacedById: null,
    });
  }

  async revokeAll(userId: string, reason: string, now = new Date()): Promise<number> {
    return this.repo.revokeAllForUser(userId, reason, now);
  }

  async rotate(input: {
    refreshToken: string;
    userAuthzVersion: number;
    policyVersion: number;
    ttlMs: number;
    now?: Date;
  }): Promise<
    | { ok: true; session: SessionRecord; refreshToken: string }
    | { ok: false; reason: SessionFailure }
  > {
    const now = input.now ?? new Date();
    const current = await this.assertActive({
      refreshToken: input.refreshToken,
      userAuthzVersion: input.userAuthzVersion,
      policyVersion: input.policyVersion,
      now,
    });
    if (!current.ok) return current;

    const refreshToken = generateOpaqueToken();
    const next: SessionRecord = {
      ...current.session,
      id: generateOpaqueToken(),
      status: "ACTIVE",
      refreshTokenHash: hashOpaqueToken(refreshToken),
      issuedAt: now,
      expiresAt: new Date(now.getTime() + input.ttlMs),
      revokedAt: null,
      revokeReason: null,
      replacedById: null,
      authzVersion: input.userAuthzVersion,
      policyVersion: input.policyVersion,
    };
    const revoked = await this.repo.compareAndRevoke(current.session.id, {
      revokedAt: now,
      revokeReason: "rotated",
      replacedById: next.id,
    });
    if (!revoked) {
      await this.repo.revokeFamily(current.session.familyId, "refresh_replay", now);
      return { ok: false, reason: "replay" };
    }
    await this.repo.insert(next);
    return { ok: true, session: next, refreshToken };
  }
}
