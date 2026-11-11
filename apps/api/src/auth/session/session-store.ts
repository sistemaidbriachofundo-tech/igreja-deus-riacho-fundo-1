import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import type { PrismaService } from "../../prisma/prisma.service";
import { AuthClock } from "./auth-clock";

/**
 * PROPOSTA PARA O INTEGRADOR (#189 / frente E). Esta frente NÃO altera
 * schema.prisma nem cria migration. Persistência durável só liga com
 * AUTH_STATE_STORE=prisma DEPOIS que a migration abaixo existir.
 * Sem a tabela, o adapter falha fechado (503) e não emite JWT.
 *
 * -- reversível: DROP TABLE nas três relações, nesta ordem
 * CREATE TABLE auth_sessions (
 *   id TEXT PRIMARY KEY, -- sha256 hex do sid do JWT, nunca o sid em claro
 *   user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 *   family_id TEXT NOT NULL,
 *   authz_version TEXT NOT NULL,
 *   mfa_satisfied BOOLEAN NOT NULL,
 *   expires_at TIMESTAMPTZ NOT NULL,
 *   revoked_at TIMESTAMPTZ,
 *   replaced_by_id TEXT,
 *   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 * );
 * CREATE INDEX auth_sessions_user_idx ON auth_sessions (user_id);
 * CREATE INDEX auth_sessions_family_idx ON auth_sessions (family_id);
 *
 * CREATE TABLE auth_mfa_challenges (
 *   id TEXT PRIMARY KEY, -- sha256 hex do challenge opaco
 *   user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 *   purpose TEXT NOT NULL, -- totp | enroll
 *   expires_at TIMESTAMPTZ NOT NULL,
 *   consumed_at TIMESTAMPTZ,
 *   attempts INTEGER NOT NULL DEFAULT 0,
 *   reads INTEGER NOT NULL DEFAULT 0,
 *   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 * );
 * CREATE INDEX auth_mfa_challenges_user_idx ON auth_mfa_challenges (user_id);
 *
 * CREATE TABLE auth_attempt_windows (
 *   bucket_key TEXT PRIMARY KEY, -- fingerprint, nunca e-mail ou senha
 *   failures INTEGER NOT NULL,
 *   window_started_at TIMESTAMPTZ NOT NULL,
 *   updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 * );
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
      await this.prisma.$executeRaw`
        INSERT INTO auth_sessions (
          id, user_id, family_id, authz_version, mfa_satisfied, expires_at, created_at
        ) VALUES (
          ${digestPresentedId(sessionId)},
          ${input.userId},
          ${input.familyId},
          ${input.authzVersion},
          ${input.mfaSatisfied},
          ${new Date(input.expiresAtMs)},
          ${new Date(this.clock.now())}
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
        SELECT user_id, family_id, authz_version, mfa_satisfied, expires_at, revoked_at, replaced_by_id
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
      authzVersion: row.authz_version,
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
        SET revoked_at = ${new Date(this.clock.now())},
            replaced_by_id = ${replaced}
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
        SET revoked_at = ${new Date(this.clock.now())}
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
        SET revoked_at = ${new Date(this.clock.now())}
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
  authz_version: string;
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
