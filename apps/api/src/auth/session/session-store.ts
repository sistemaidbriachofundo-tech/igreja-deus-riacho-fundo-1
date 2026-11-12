import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import type { PrismaService } from "../../prisma/prisma.service";
import { AuthClock } from "./auth-clock";
import { utcTimestamp } from "./utc-timestamp";

/**
 * Persistência na tabela auth_sessions da migração F1.1.
 * O sid do JWT não é gravado: a chave é o sha256.
 * authz_version inteiro permanece o contador do schema; o fingerprint
 * da frente A fica em authz_fingerprint. Sem a tabela, 503 e nenhum JWT.
 */

export interface SessionRecord {
  userId: string;
  familyId: string;
  authzVersion: string;
  mfaSatisfied: boolean;
  expiresAtMs: number;
  revokedAtMs: number | null;
  replacedById: string | null;
}

export interface SessionStore {
  create(input: {
    userId: string;
    familyId: string;
    authzVersion: string;
    mfaSatisfied: boolean;
    expiresAtMs: number;
  }): Promise<{ sessionId: string }>;
  get(sessionId: string): Promise<SessionRecord | null>;
  revoke(sessionId: string, replacedBySessionId?: string): Promise<void>;
  revokeAllForUser(userId: string): Promise<void>;
  revokeFamily(familyId: string): Promise<void>;
}

@Injectable()
export class InMemorySessionStore implements SessionStore {
  private readonly rows = new Map<string, SessionRecord>();

  constructor(private readonly clock: AuthClock = new AuthClock()) {}

  async create(input: {
    userId: string;
    familyId: string;
    authzVersion: string;
    mfaSatisfied: boolean;
    expiresAtMs: number;
  }): Promise<{ sessionId: string }> {
    this.purge();
    const sessionId = newPresentedId();
    this.rows.set(digestPresentedId(sessionId), {
      userId: input.userId,
      familyId: input.familyId,
      authzVersion: input.authzVersion,
      mfaSatisfied: input.mfaSatisfied,
      expiresAtMs: input.expiresAtMs,
      revokedAtMs: null,
      replacedById: null,
    });
    return { sessionId };
  }

  async get(sessionId: string): Promise<SessionRecord | null> {
    if (!isPresentedId(sessionId)) {
      return null;
    }
    const row = this.rows.get(digestPresentedId(sessionId));
    return row ? { ...row } : null;
  }

  async revoke(sessionId: string, replacedBySessionId?: string): Promise<void> {
    if (!isPresentedId(sessionId)) {
      return;
    }
    const row = this.rows.get(digestPresentedId(sessionId));
    if (!row || row.revokedAtMs) {
      return;
    }
    row.revokedAtMs = this.clock.now();
    row.replacedById =
      replacedBySessionId && isPresentedId(replacedBySessionId)
        ? digestPresentedId(replacedBySessionId)
        : null;
  }

  async revokeAllForUser(userId: string): Promise<void> {
    const now = this.clock.now();
    for (const row of this.rows.values()) {
      if (row.userId === userId && !row.revokedAtMs) {
        row.revokedAtMs = now;
      }
    }
  }

  async revokeFamily(familyId: string): Promise<void> {
    const now = this.clock.now();
    for (const row of this.rows.values()) {
      if (row.familyId === familyId && !row.revokedAtMs) {
        row.revokedAtMs = now;
      }
    }
  }

  private purge(): void {
    if (this.rows.size < 5000) {
      return;
    }
    const now = this.clock.now();
    for (const [key, row] of this.rows) {
      if ((row.revokedAtMs ?? row.expiresAtMs) < now) {
        this.rows.delete(key);
      }
    }
  }
}

@Injectable()
export class PrismaSessionStore implements SessionStore {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: AuthClock = new AuthClock(),
  ) {}

  async create(input: {
    userId: string;
    familyId: string;
    authzVersion: string;
    mfaSatisfied: boolean;
    expiresAtMs: number;
  }): Promise<{ sessionId: string }> {
    const sessionId = newPresentedId();
    try {
      const now = new Date(this.clock.now());
      const id = digestPresentedId(sessionId);
      await this.prisma.$executeRaw`
        INSERT INTO auth_sessions (
          id, user_id, family_id, status, authz_version, authz_fingerprint,
          policy_version, refresh_token_hash, mfa_satisfied, expires_at, created_at, updated_at
        ) VALUES (
          ${id},
          ${input.userId},
          ${input.familyId},
          'ACTIVE',
          1,
          ${input.authzVersion},
          1,
          ${id},
          ${input.mfaSatisfied},
          ${utcTimestamp(new Date(input.expiresAtMs))},
          ${utcTimestamp(now)},
          ${utcTimestamp(now)}
        )
      `;
    } catch {
      throw new ServiceUnavailableException("Sessão indisponível");
    }
    return { sessionId };
  }

  async get(sessionId: string): Promise<SessionRecord | null> {
    if (!isPresentedId(sessionId)) {
      return null;
    }
    let rows: SessionRow[];
    try {
      rows = await this.prisma.$queryRaw<SessionRow[]>`
        SELECT user_id, family_id, authz_fingerprint, mfa_satisfied, expires_at, revoked_at, replaced_by_id
        FROM auth_sessions
        WHERE id = ${digestPresentedId(sessionId)}
      `;
    } catch {
      throw new ServiceUnavailableException("Sessão indisponível");
    }
    const row = rows[0];
    if (!row) {
      return null;
    }
    return {
      userId: row.user_id,
      familyId: row.family_id,
      authzVersion: row.authz_fingerprint ?? "",
      mfaSatisfied: Boolean(row.mfa_satisfied),
      expiresAtMs: toMillis(row.expires_at),
      revokedAtMs: row.revoked_at ? toMillis(row.revoked_at) : null,
      replacedById: row.replaced_by_id,
    };
  }

  async revoke(sessionId: string, replacedBySessionId?: string): Promise<void> {
    if (!isPresentedId(sessionId)) {
      return;
    }
    const replaced =
      replacedBySessionId && isPresentedId(replacedBySessionId)
        ? digestPresentedId(replacedBySessionId)
        : null;
    try {
      await this.prisma.$executeRaw`
        UPDATE auth_sessions
        SET status = 'REVOKED',
            revoked_at = ${utcTimestamp(new Date(this.clock.now()))},
            replaced_by_id = ${replaced},
            updated_at = ${utcTimestamp(new Date(this.clock.now()))}
        WHERE id = ${digestPresentedId(sessionId)}
          AND revoked_at IS NULL
      `;
    } catch {
      throw new ServiceUnavailableException("Sessão indisponível");
    }
  }

  async revokeAllForUser(userId: string): Promise<void> {
    try {
      await this.prisma.$executeRaw`
        UPDATE auth_sessions
        SET status = 'REVOKED',
            revoked_at = ${utcTimestamp(new Date(this.clock.now()))},
            updated_at = ${utcTimestamp(new Date(this.clock.now()))}
        WHERE user_id = ${userId}
          AND revoked_at IS NULL
      `;
    } catch {
      throw new ServiceUnavailableException("Sessão indisponível");
    }
  }

  async revokeFamily(familyId: string): Promise<void> {
    try {
      await this.prisma.$executeRaw`
        UPDATE auth_sessions
        SET status = 'REVOKED',
            revoked_at = ${utcTimestamp(new Date(this.clock.now()))},
            updated_at = ${utcTimestamp(new Date(this.clock.now()))}
        WHERE family_id = ${familyId}
          AND revoked_at IS NULL
      `;
    } catch {
      throw new ServiceUnavailableException("Sessão indisponível");
    }
  }
}

interface SessionRow {
  user_id: string;
  family_id: string;
  authz_fingerprint: string | null;
  mfa_satisfied: boolean;
  expires_at: Date | string;
  revoked_at: Date | string | null;
  replaced_by_id: string | null;
}

export function newPresentedId(): string {
  return randomBytes(32).toString("base64url");
}

export function isPresentedId(value: string): boolean {
  return /^[A-Za-z0-9_-]{20,200}$/.test(value);
}

/** sha256 do identificador apresentado. O valor em claro não vai para o banco. */
export function digestPresentedId(presentedId: string): string {
  return createHash("sha256").update(presentedId).digest("hex");
}

function toMillis(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}
