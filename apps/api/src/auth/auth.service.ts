import {
  ForbiddenException,
  Inject,
  Injectable,
  Optional,
  ServiceUnavailableException,
} from "@nestjs/common";
import * as argon2 from "argon2";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
  assertPersonId,
  canAccessChurch,
  resolveDefaultActiveContext,
  APP_NAME,
  type AuthGrant,
} from "@idbrf/shared";
import { PrismaService } from "../prisma/prisma.service";
import { PilotService } from "../pilot/pilot.service";
import {
  JWT_DEV_FALLBACK_SECRET,
  JWT_SECRET_MIN_LENGTH,
} from "./auth.constants";
import {
  invalidCredentials,
  mfaFailure,
  sanitizeAuditMetadata,
  tokenFailure,
} from "./login/auth-errors";
import { authLimits } from "./login/auth-limits";
import {
  InMemoryAuthAttemptLimiter,
  type AuthAttemptLimiter,
} from "./login/auth-attempt-limiter";
import { decryptTotpSecret, encryptTotpSecret } from "./mfa/mfa-crypto.util";
import {
  InMemoryMfaChallengeStore,
  type MfaChallengePurpose,
  type MfaChallengeRecord,
  type MfaChallengeStore,
} from "./mfa/mfa-challenge.store";
import {
  buildOtpAuthUri,
  generateTotpSecret,
  verifyTotpCode,
} from "./mfa/totp.util";
import { requiresStepUpMfa } from "./privileged-roles";
import { AuthClock } from "./session/auth-clock";
import {
  AUTH_ATTEMPT_LIMITER,
  MFA_CHALLENGE_STORE,
  SESSION_STORE,
} from "./session/auth-state.tokens";
import { authzVersion, factorStateOf, type AuthzMaterial } from "./session/authz-version";
import {
  InMemorySessionStore,
  isPresentedId,
  newPresentedId,
  type SessionRecord,
  type SessionStore,
} from "./session/session-store";
import type { AuthUser, JwtPayload } from "./types/auth-user";

interface LoginInput {
  email: string;
  password: string;
  /** IP já resolvido pelo adaptador. Não é X-Forwarded-For cru. */
  clientIp?: string;
}

export interface MfaChallengeResponse {
  mfa: {
    enabled: boolean;
    required: true;
    challengeRequired: boolean;
    enrollmentRequired: boolean;
    challengeId: string;
    expiresInSeconds: number;
    oidcLive: false;
  };
}

export interface SessionToken {
  accessToken: string;
  tokenType: "Bearer";
  expiresInSeconds: number;
  user: AuthUser;
  mfa: {
    enabled: boolean;
    required: boolean;
    challengeRequired: false;
    enrollmentRequired: false;
    oidcLive: false;
  };
}

export interface EnrollmentStart {
  factorId: string;
  status: "PENDING_ENROLLMENT";
  otpauthUri: string;
  secret: string;
  expiresInSeconds: number;
}

export type LoginResult = SessionToken | MfaChallengeResponse;

interface LoadedUser {
  userId: string;
  personId: string;
  email: string;
  status: string;
  mfaRequired: boolean;
  passwordHash: string | null;
  grants: AuthGrant[];
  factor: {
    id: string;
    status: string;
    secretCiphertext: string | null;
  } | null;
}

interface PilotContext {
  organizationId: string;
  churchId: string;
}

let dummyPasswordHash: Promise<string> | null = null;

/**
 * Autenticação com sessão revogável e MFA bloqueante para perfis privilegiados.
 * O store padrão é em memória (processo único). AUTH_STATE_STORE=prisma usa as
 * tabelas propostas ao integrador #189 e falha fechado se elas não existirem.
 */
@Injectable()
export class AuthService {
  private readonly clock: AuthClock;
  private readonly sessions: SessionStore;
  private readonly challenges: MfaChallengeStore;
  private readonly attempts: AuthAttemptLimiter;

  constructor(
    private readonly prisma: PrismaService,
    private readonly pilot: PilotService,
    @Optional() @Inject(SESSION_STORE) sessions?: SessionStore,
    @Optional() @Inject(MFA_CHALLENGE_STORE) challenges?: MfaChallengeStore,
    @Optional() @Inject(AUTH_ATTEMPT_LIMITER) attempts?: AuthAttemptLimiter,
    @Optional() clock?: AuthClock,
  ) {
    this.clock = clock ?? new AuthClock();
    this.sessions = sessions ?? new InMemorySessionStore(this.clock);
    this.challenges = challenges ?? new InMemoryMfaChallengeStore(this.clock);
    this.attempts = attempts ?? new InMemoryAuthAttemptLimiter(this.clock);
  }

  async login(input: LoginInput): Promise<LoginResult> {
    const email = input.email.trim().toLowerCase();
    const emailFingerprint = fingerprint(email);
    const ipFingerprint = input.clientIp ? fingerprint(input.clientIp) : null;
    const windowMs = authLimits.loginWindowMs();
    const limit = authLimits.loginFailures();
    await this.attempts.assertAllowed(`pw:${emailFingerprint}`, limit, windowMs);
    if (ipFingerprint) {
      await this.attempts.assertAllowed(`ip:${ipFingerprint}`, limit * 4, windowMs);
    }

    const pilot = await this.pilot.getPilotChurch();
    const loaded = await this.findUserByEmail(email);

    if (!loaded || loaded.status !== "ACTIVE") {
      await this.spendPasswordTime(input.password);
      await this.notePasswordFailure(emailFingerprint, ipFingerprint, windowMs);
      await this.audit({
        actorUserId: null,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        action: "auth.login_failed",
        metadata: {
          reason: loaded ? "inactive_user" : "invalid_user",
          emailFingerprint,
        },
      });
      throw invalidCredentials();
    }

    if (!(await verifyPassword(input.password, loaded.passwordHash))) {
      await this.notePasswordFailure(emailFingerprint, ipFingerprint, windowMs);
      await this.audit({
        actorUserId: loaded.userId,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        action: "auth.login_failed",
        metadata: { reason: "invalid_password", emailFingerprint },
      });
      throw invalidCredentials();
    }

    await this.attempts.reset(`pw:${emailFingerprint}`);
    const stepUp = requiresStepUpMfa(loaded.grants, loaded.mfaRequired);
    const factorReady =
      loaded.factor?.status === "ENABLED" && Boolean(loaded.factor.secretCiphertext);

    if (!stepUp) {
      const session = await this.issueSession(loaded, { mfaSatisfied: false });
      await this.audit({
        actorUserId: loaded.userId,
        organizationId: session.user.organizationId ?? null,
        churchId: session.user.churchId ?? null,
        action: "auth.login",
        metadata: {
          emailFingerprint,
          mfaEnabled: factorReady,
          mfaRequired: false,
          mfaSatisfied: false,
        },
      });
      return session;
    }

    const purpose: MfaChallengePurpose = factorReady ? "totp" : "enroll";
    const ttlMs = purpose === "totp" ? authLimits.challengeTtlMs() : authLimits.enrollTtlMs();
    const issued = await this.issueChallenge(loaded.userId, purpose, ttlMs);
    const active = resolveDefaultActiveContext(loaded.grants, pilot);
    await this.audit({
      actorUserId: loaded.userId,
      organizationId: active.organizationId,
      churchId: active.churchId,
      action: "auth.mfa_challenge_issued",
      metadata: {
        emailFingerprint,
        mfaEnabled: factorReady,
        mfaRequired: true,
        purpose,
      },
    });
    return {
      mfa: {
        enabled: factorReady,
        required: true,
        challengeRequired: purpose === "totp",
        enrollmentRequired: purpose === "enroll",
        challengeId: issued.challengeId,
        expiresInSeconds: Math.floor(ttlMs / 1000),
        oidcLive: false,
      },
    };
  }

  async verifyMfaChallenge(input: { challengeId: string; code: string }): Promise<SessionToken> {
    const challenge = await this.openChallenge(input.challengeId, "totp");
    if (!/^\d{6}$/.test(input.code)) {
      throw mfaFailure("MFA_INVALID");
    }
    await this.attempts.assertAllowed(
      `mfa:${challenge.userId}`,
      authLimits.mfaFailures(),
      authLimits.mfaWindowMs(),
    );
    const loaded = await this.loadUserById(challenge.userId);
    const secret = this.readEnabledSecret(loaded);
    const valid = secret
      ? verifyTotpCode(secret, input.code, this.clock.now())
      : false;
    if (!loaded || loaded.status !== "ACTIVE" || !valid) {
      await this.attempts.recordFailure(`mfa:${challenge.userId}`, authLimits.mfaWindowMs());
      await this.challenges.recordFailure(input.challengeId, authLimits.challengeAttempts());
      await this.auditMfaFailure(loaded, "invalid_code");
      throw mfaFailure("MFA_INVALID");
    }
    await this.consumeOrThrow(input.challengeId);
    await this.attempts.reset(`mfa:${challenge.userId}`);
    const session = await this.issueSession(loaded, { mfaSatisfied: true });
    await this.audit({
      actorUserId: loaded.userId,
      organizationId: session.user.organizationId ?? null,
      churchId: session.user.churchId ?? null,
      action: "auth.login",
      metadata: { mfaEnabled: true, mfaRequired: true, mfaSatisfied: true },
    });
    return session;
  }

  /**
   * Enrollment preso ao desafio de login. Devolve o otpauth só na resposta;
   * auditoria não carrega URI, segredo nem challenge.
   */
  async beginMfaEnrollment(input: {
    challengeId: string;
    label?: string;
  }): Promise<EnrollmentStart> {
    const challenge = await this.openChallenge(input.challengeId, "enroll");
    const read = await this.challenges.recordRead(input.challengeId, authLimits.enrollReads());
    if (read.burned) {
      throw mfaFailure("MFA_INVALID");
    }
    const loaded = await this.loadUserById(challenge.userId);
    if (!loaded || loaded.status !== "ACTIVE" || loaded.factor?.status === "ENABLED") {
      throw mfaFailure("MFA_INVALID");
    }
    const secret = generateTotpSecret();
    const secretCiphertext = encryptTotpSecret(secret);
    const label = input.label?.trim().slice(0, 64) || "Authenticator";
    const factor = loaded.factor
      ? await this.prisma.userMfaFactor.update({
          where: { id: loaded.factor.id },
          data: {
            status: "PENDING_ENROLLMENT",
            secretCiphertext,
            label,
            verifiedAt: null,
            disabledAt: null,
          },
        })
      : await this.prisma.userMfaFactor.create({
          data: {
            userId: loaded.userId,
            factorType: "TOTP",
            status: "PENDING_ENROLLMENT",
            secretCiphertext,
            label,
          },
        });
    await this.audit({
      actorUserId: loaded.userId,
      organizationId: null,
      churchId: null,
      action: "mfa.totp.enroll_start",
      metadata: { purpose: "enroll" },
    });
    return {
      factorId: factor.id,
      status: "PENDING_ENROLLMENT",
      otpauthUri: buildOtpAuthUri({
        secret,
        accountName: loaded.email,
        issuer: APP_NAME,
      }),
      secret,
      expiresInSeconds: Math.max(
        1,
        Math.floor((challenge.expiresAtMs - this.clock.now()) / 1000),
      ),
    };
  }

  async confirmMfaEnrollment(input: {
    challengeId: string;
    code: string;
  }): Promise<SessionToken> {
    const challenge = await this.openChallenge(input.challengeId, "enroll");
    if (!/^\d{6}$/.test(input.code)) {
      throw mfaFailure("MFA_INVALID");
    }
    const loaded = await this.loadUserById(challenge.userId);
    const pending =
      loaded?.factor?.status === "PENDING_ENROLLMENT" && loaded.factor.secretCiphertext
        ? this.decryptSecret(loaded.factor.secretCiphertext)
        : null;
    const valid =
      loaded?.status === "ACTIVE" &&
      pending &&
      verifyTotpCode(pending, input.code, this.clock.now());
    if (!loaded || !valid) {
      await this.challenges.recordFailure(input.challengeId, authLimits.challengeAttempts());
      await this.auditMfaFailure(loaded, "invalid_enroll_code");
      throw mfaFailure("MFA_INVALID");
    }
    await this.consumeOrThrow(input.challengeId);
    await this.prisma.userMfaFactor.update({
      where: { id: loaded.factor!.id },
      data: { status: "ENABLED", verifiedAt: new Date(this.clock.now()), disabledAt: null },
    });
    const enabled = await this.loadUserById(loaded.userId);
    if (!enabled || enabled.factor?.status !== "ENABLED") {
      throw new ServiceUnavailableException("Verificação indisponível");
    }
    const session = await this.issueSession(enabled, { mfaSatisfied: true });
    await this.audit({
      actorUserId: enabled.userId,
      organizationId: session.user.organizationId ?? null,
      churchId: session.user.churchId ?? null,
      action: "mfa.totp.enable",
      metadata: { mfaSatisfied: true },
    });
    return session;
  }

  async refresh(actor: AuthUser): Promise<SessionToken> {
    const session = await this.requireLiveSession(actor);
    const loaded = await this.requireActiveUser(actor.userId);
    await this.assertVersion(session, loaded, actor.sessionId!);
    await this.assertMfa(session, loaded, actor.sessionId!);
    const pilot = await this.pilot.getPilotChurch();
    const kept = this.keepChurch(loaded.grants, actor, pilot);
    const next = await this.rotate(actor.sessionId!, session, loaded, kept);
    await this.audit({
      actorUserId: loaded.userId,
      organizationId: next.user.organizationId ?? null,
      churchId: next.user.churchId ?? null,
      action: "auth.refresh",
      metadata: { mfaSatisfied: session.mfaSatisfied },
    });
    return next;
  }

  async switchChurch(actor: AuthUser, churchId: string): Promise<SessionToken> {
    const session = await this.requireLiveSession(actor);
    const loaded = await this.requireActiveUser(actor.userId);
    await this.assertVersion(session, loaded, actor.sessionId!);
    await this.assertMfa(session, loaded, actor.sessionId!);
    const church = await this.prisma.church.findUnique({ where: { id: churchId } });
    if (!church) {
      throw new ForbiddenException("Congregação inválida");
    }
    if (
      !canAccessChurch(loaded.grants, {
        organizationId: church.organizationId,
        churchId: church.id,
      })
    ) {
      throw new ForbiddenException(
        "Sem grant para esta congregação — church switch negado",
      );
    }
    return this.rotate(actor.sessionId!, session, loaded, {
      organizationId: church.organizationId,
      churchId: church.id,
    });
  }

  async logout(actor: AuthUser): Promise<{ ok: true }> {
    await this.requireLiveSession(actor);
    await this.sessions.revoke(actor.sessionId!);
    await this.audit({
      actorUserId: actor.userId,
      organizationId: actor.organizationId ?? null,
      churchId: actor.churchId ?? null,
      action: "auth.logout",
      metadata: {},
    });
    return { ok: true };
  }

  async logoutAll(actor: AuthUser): Promise<{ ok: true }> {
    await this.requireLiveSession(actor);
    await this.sessions.revokeAllForUser(actor.userId);
    await this.audit({
      actorUserId: actor.userId,
      organizationId: actor.organizationId ?? null,
      churchId: actor.churchId ?? null,
      action: "auth.logout_all",
      metadata: {},
    });
    return { ok: true };
  }

  /**
   * Assinatura + sessão viva + versão de autorização.
   * Grants da resposta vêm do banco, não do JWT.
   */
  async verifyAccessToken(token: string): Promise<AuthUser> {
    const payload = verifyJwt(token, this.jwtSecret(), this.clock.now());
    if (!payload.sid || !isPresentedId(payload.sid)) {
      throw tokenFailure("SESSION_INVALID");
    }
    const session = await this.readSession(payload.sid);
    if (!session || session.userId !== payload.sub) {
      throw tokenFailure("SESSION_INVALID");
    }
    if (session.revokedAtMs) {
      if (session.replacedById) {
        await this.sessions.revokeFamily(session.familyId);
        throw tokenFailure("SESSION_REPLAY");
      }
      throw tokenFailure("SESSION_REVOKED");
    }
    if (session.expiresAtMs <= this.clock.now()) {
      throw tokenFailure("SESSION_EXPIRED");
    }
    const loaded = await this.loadUserById(payload.sub);
    if (!loaded || loaded.status !== "ACTIVE") {
      await this.sessions.revokeAllForUser(payload.sub);
      throw tokenFailure("USER_INACTIVE");
    }
    await this.assertVersion(session, loaded, payload.sid, payload.av);
    await this.assertMfa(session, loaded, payload.sid);
    return {
      userId: loaded.userId,
      personId: assertPersonId(loaded.personId),
      email: loaded.email,
      grants: loaded.grants,
      organizationId: payload.organizationId ?? null,
      churchId: payload.churchId ?? null,
      sessionId: payload.sid,
      authzVersion: session.authzVersion,
    };
  }

  signAccessToken(payload: JwtPayload): string {
    return signJwt(payload, this.jwtSecret(), authLimits.accessTtlSeconds(), this.clock.now());
  }

  private async issueSession(
    loaded: LoadedUser,
    opts: {
      mfaSatisfied: boolean;
      organizationId?: string | null;
      churchId?: string | null;
      familyId?: string;
    },
  ): Promise<SessionToken> {
    const pilot = await this.pilot.getPilotChurch();
    const place = this.keepChurch(loaded.grants, {
      organizationId: opts.organizationId,
      churchId: opts.churchId,
    }, pilot);
    const version = authzVersion(toMaterial(loaded));
    let created: { sessionId: string };
    try {
      created = await this.sessions.create({
        userId: loaded.userId,
        familyId: opts.familyId ?? newPresentedId(),
        authzVersion: version,
        mfaSatisfied: opts.mfaSatisfied,
        expiresAtMs: this.clock.now() + authLimits.accessTtlSeconds() * 1000,
      });
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      throw new ServiceUnavailableException("Sessão indisponível");
    }
    const personId = assertPersonId(loaded.personId);
    const user: AuthUser = {
      userId: loaded.userId,
      personId,
      email: loaded.email,
      grants: loaded.grants,
      organizationId: place.organizationId,
      churchId: place.churchId,
      sessionId: created.sessionId,
      authzVersion: version,
    };
    return {
      accessToken: this.signAccessToken({
        sub: user.userId,
        personId,
        email: user.email,
        grants: user.grants,
        organizationId: place.organizationId,
        churchId: place.churchId,
        sid: created.sessionId,
        av: version,
      }),
      tokenType: "Bearer",
      expiresInSeconds: authLimits.accessTtlSeconds(),
      user,
      mfa: {
        enabled: loaded.factor?.status === "ENABLED",
        required: requiresStepUpMfa(loaded.grants, loaded.mfaRequired),
        challengeRequired: false,
        enrollmentRequired: false,
        oidcLive: false,
      },
    };
  }

  private async rotate(
    previousSessionId: string,
    previous: SessionRecord,
    loaded: LoadedUser,
    place: { organizationId: string | null; churchId: string | null },
  ): Promise<SessionToken> {
    const next = await this.issueSession(loaded, {
      mfaSatisfied: previous.mfaSatisfied,
      organizationId: place.organizationId,
      churchId: place.churchId,
      familyId: previous.familyId,
    });
    await this.sessions.revoke(previousSessionId, next.user.sessionId);
    return next;
  }

  private keepChurch(
    grants: AuthGrant[],
    actor: { organizationId?: string | null; churchId?: string | null },
    pilot: PilotContext,
  ): { organizationId: string | null; churchId: string | null } {
    if (
      actor.organizationId &&
      actor.churchId &&
      canAccessChurch(grants, {
        organizationId: actor.organizationId,
        churchId: actor.churchId,
      })
    ) {
      return { organizationId: actor.organizationId, churchId: actor.churchId };
    }
    return resolveDefaultActiveContext(grants, pilot);
  }

  private async requireLiveSession(actor: AuthUser): Promise<SessionRecord> {
    if (!actor.sessionId || !isPresentedId(actor.sessionId)) {
      throw tokenFailure("SESSION_INVALID");
    }
    const session = await this.readSession(actor.sessionId);
    if (!session || session.userId !== actor.userId) {
      throw tokenFailure("SESSION_INVALID");
    }
    if (session.revokedAtMs) {
      if (session.replacedById) {
        await this.sessions.revokeFamily(session.familyId);
        throw tokenFailure("SESSION_REPLAY");
      }
      throw tokenFailure("SESSION_REVOKED");
    }
    if (session.expiresAtMs <= this.clock.now()) {
      throw tokenFailure("SESSION_EXPIRED");
    }
    return session;
  }

  private async requireActiveUser(userId: string): Promise<LoadedUser> {
    const loaded = await this.loadUserById(userId);
    if (!loaded || loaded.status !== "ACTIVE") {
      await this.sessions.revokeAllForUser(userId);
      throw tokenFailure("USER_INACTIVE");
    }
    return loaded;
  }

  private async assertVersion(
    session: SessionRecord,
    loaded: LoadedUser,
    sessionId: string,
    tokenVersion?: string,
  ): Promise<void> {
    const current = authzVersion(toMaterial(loaded));
    if (current !== session.authzVersion || (tokenVersion && tokenVersion !== session.authzVersion)) {
      await this.sessions.revoke(sessionId);
      throw tokenFailure("AUTHZ_STALE");
    }
  }

  private async assertMfa(
    session: SessionRecord,
    loaded: LoadedUser,
    sessionId: string,
  ): Promise<void> {
    if (requiresStepUpMfa(loaded.grants, loaded.mfaRequired) && !session.mfaSatisfied) {
      await this.sessions.revoke(sessionId);
      throw tokenFailure("SESSION_MFA_REQUIRED");
    }
  }

  private async readSession(sessionId: string): Promise<SessionRecord | null> {
    try {
      return await this.sessions.get(sessionId);
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      throw tokenFailure("SESSION_INVALID");
    }
  }

  private async issueChallenge(
    userId: string,
    purpose: MfaChallengePurpose,
    ttlMs: number,
  ): Promise<{ challengeId: string }> {
    try {
      return await this.challenges.create({
        userId,
        purpose,
        expiresAtMs: this.clock.now() + ttlMs,
      });
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      throw new ServiceUnavailableException("Verificação indisponível");
    }
  }

  private async openChallenge(
    challengeId: string,
    purpose: MfaChallengePurpose,
  ): Promise<MfaChallengeRecord> {
    if (!isPresentedId(challengeId)) {
      throw mfaFailure("MFA_INVALID");
    }
    let challenge: MfaChallengeRecord | null;
    try {
      challenge = await this.challenges.get(challengeId);
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      throw mfaFailure("MFA_INVALID");
    }
    if (!challenge) {
      throw mfaFailure("MFA_INVALID");
    }
    if (challenge.consumedAtMs) {
      throw mfaFailure("MFA_REPLAY");
    }
    if (challenge.expiresAtMs <= this.clock.now()) {
      throw mfaFailure("MFA_EXPIRED");
    }
    if (challenge.purpose !== purpose) {
      throw mfaFailure("MFA_INVALID");
    }
    return challenge;
  }

  private async consumeOrThrow(challengeId: string): Promise<void> {
    const consumed = await this.challenges.consume(challengeId);
    if (consumed === "replay") {
      throw mfaFailure("MFA_REPLAY");
    }
    if (consumed === "expired") {
      throw mfaFailure("MFA_EXPIRED");
    }
    if (consumed !== "ok") {
      throw mfaFailure("MFA_INVALID");
    }
  }

  private readEnabledSecret(loaded: LoadedUser | null): string | null {
    if (!loaded || loaded.status !== "ACTIVE") {
      return null;
    }
    if (loaded.factor?.status !== "ENABLED" || !loaded.factor.secretCiphertext) {
      return null;
    }
    return this.decryptSecret(loaded.factor.secretCiphertext);
  }

  private decryptSecret(ciphertext: string): string | null {
    try {
      return decryptTotpSecret(ciphertext);
    } catch {
      return null;
    }
  }

  private async notePasswordFailure(
    emailFingerprint: string,
    ipFingerprint: string | null,
    windowMs: number,
  ): Promise<void> {
    await this.attempts.recordFailure(`pw:${emailFingerprint}`, windowMs);
    if (ipFingerprint) {
      await this.attempts.recordFailure(`ip:${ipFingerprint}`, windowMs);
    }
  }

  private async spendPasswordTime(password: string): Promise<void> {
    dummyPasswordHash ??= hashPassword("not-a-real-password-padding-value");
    await verifyPassword(password, await dummyPasswordHash);
  }

  private async auditMfaFailure(
    loaded: LoadedUser | null,
    reason: string,
  ): Promise<void> {
    await this.audit({
      actorUserId: loaded?.userId ?? null,
      organizationId: null,
      churchId: null,
      action: "auth.mfa_failed",
      metadata: { reason },
    });
  }

  private async findUserByEmail(email: string): Promise<LoadedUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: userInclude,
    });
    return user ? mapLoaded(user) : null;
  }

  private async loadUserById(userId: string): Promise<LoadedUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: userInclude,
    });
    return user ? mapLoaded(user) : null;
  }

  private async audit(input: {
    actorUserId: string | null;
    organizationId: string | null;
    churchId: string | null;
    action: string;
    metadata: Record<string, unknown>;
  }): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorUserId: input.actorUserId,
        action: input.action,
        resourceType: "auth",
        resourceId: input.actorUserId,
        organizationId: input.organizationId,
        churchId: input.churchId,
        metadata: sanitizeAuditMetadata(input.metadata),
      },
    });
  }

  private jwtSecret(): string {
    return resolveJwtSecret(process.env.JWT_SECRET, process.env.NODE_ENV);
  }
}

const userInclude = {
  grants: { include: { role: true } },
  mfaFactors: {
    where: { factorType: "TOTP" },
    select: { id: true, status: true, secretCiphertext: true },
  },
} as const;

function mapLoaded(user: {
  id: string;
  personId: string;
  email: string;
  status: string;
  mfaRequired?: boolean;
  passwordHash?: string | null;
  grants: Array<{
    organizationId: string | null;
    churchId: string | null;
    ministryId: string | null;
    role: { code: string };
  }>;
  mfaFactors?: Array<{
    id: string;
    status: string;
    secretCiphertext: string | null;
  }>;
}): LoadedUser {
  const factor = user.mfaFactors?.[0] ?? null;
  return {
    userId: user.id,
    personId: assertPersonId(user.personId),
    email: user.email,
    status: user.status,
    mfaRequired: Boolean(user.mfaRequired),
    passwordHash: user.passwordHash ?? null,
    grants: mapGrants(user.grants),
    factor,
  };
}

function toMaterial(loaded: LoadedUser): AuthzMaterial {
  return {
    status: loaded.status,
    mfaRequired: loaded.mfaRequired,
    email: loaded.email,
    personId: loaded.personId,
    factorState: factorStateOf(loaded.factor ? [loaded.factor] : []),
    grants: loaded.grants,
  };
}

function fingerprint(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 16);
}

function mapGrants(
  grants: Array<{
    organizationId: string | null;
    churchId: string | null;
    ministryId: string | null;
    role: { code: string };
  }>,
): AuthGrant[] {
  return grants.map((grant) => ({
    roleCode: grant.role.code,
    organizationId: grant.organizationId,
    churchId: grant.churchId,
    ministryId: grant.ministryId ?? null,
  }));
}

/** Hash canônico (Argon2id) — seed e novas contas. */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}

/**
 * Hash legado (`sha256:<hex>`) — só para bases locais antigas pré-rotação do seed.
 */
export function hashPasswordLegacySha256(password: string): string {
  const hex = createHash("sha256").update(password, "utf8").digest("hex");
  return `sha256:${hex}`;
}

export async function verifyPassword(
  password: string,
  storedHash: string | null | undefined,
): Promise<boolean> {
  if (!storedHash) {
    return false;
  }

  if (
    storedHash.startsWith("$argon2id$") ||
    storedHash.startsWith("$argon2i$") ||
    storedHash.startsWith("$argon2d$")
  ) {
    try {
      return await argon2.verify(storedHash, password);
    } catch {
      return false;
    }
  }

  if (storedHash.startsWith("sha256:")) {
    const expected = storedHash.slice("sha256:".length);
    const actual = createHash("sha256").update(password, "utf8").digest("hex");
    if (expected.length !== actual.length) {
      return false;
    }
    return timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
  }

  return false;
}

/** Política JWT: produção exige secret ≥ 32 chars e sem prefixo de desenvolvimento. */
export function resolveJwtSecret(
  secret: string | undefined,
  nodeEnv: string | undefined,
): string {
  const isProd = nodeEnv === "production";
  const value = secret?.trim() ?? "";

  if (isProd) {
    if (value.length < JWT_SECRET_MIN_LENGTH) {
      throw new Error(
        `JWT_SECRET deve ter pelo menos ${JWT_SECRET_MIN_LENGTH} caracteres em produção`,
      );
    }
    if (value.startsWith("dev-only-")) {
      throw new Error(
        "JWT_SECRET de desenvolvimento não é permitido em produção",
      );
    }
    return value;
  }

  if (value.length >= JWT_SECRET_MIN_LENGTH) {
    return value;
  }

  return JWT_DEV_FALLBACK_SECRET;
}

function signJwt(
  payload: JwtPayload,
  secret: string,
  expiresInSeconds: number,
  nowMs: number,
): string {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(nowMs / 1000);
  const body = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
  };
  const encodedHeader = b64url(JSON.stringify(header));
  const encodedPayload = b64url(JSON.stringify(body));
  const data = `${encodedHeader}.${encodedPayload}`;
  const signature = createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${signature}`;
}

function verifyJwt(
  token: string,
  secret: string,
  nowMs: number,
): JwtPayload & { exp: number; iat: number } {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("JWT malformado");
  }
  const [encodedHeader, encodedPayload, signature] = parts;
  const header = JSON.parse(
    Buffer.from(encodedHeader, "base64url").toString("utf8"),
  ) as { alg?: string };
  if (header.alg !== "HS256") {
    throw new Error("Algoritmo JWT inválido");
  }
  const data = `${encodedHeader}.${encodedPayload}`;
  const expected = createHmac("sha256", secret).update(data).digest("base64url");
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    throw new Error("Assinatura JWT inválida");
  }
  const payload = JSON.parse(
    Buffer.from(encodedPayload, "base64url").toString("utf8"),
  ) as JwtPayload & { exp?: number; iat?: number };
  const now = Math.floor(nowMs / 1000);
  if (!Number.isSafeInteger(payload.exp) || payload.exp! <= now) {
    throw new Error("JWT expirado ou sem expiração");
  }
  if (
    typeof payload.iat !== "number" ||
    !Number.isSafeInteger(payload.iat) ||
    payload.iat > now + 60
  ) {
    throw new Error("JWT com emissão inválida");
  }
  if (
    typeof payload.sub !== "string" ||
    !payload.sub.trim() ||
    typeof payload.email !== "string" ||
    !payload.email.trim() ||
    !Array.isArray(payload.grants)
  ) {
    throw new Error("Claims JWT inválidas");
  }
  if (payload.sid !== undefined && typeof payload.sid !== "string") {
    throw new Error("Claims JWT inválidas");
  }
  if (payload.av !== undefined && typeof payload.av !== "string") {
    throw new Error("Claims JWT inválidas");
  }
  return payload as JwtPayload & { exp: number; iat: number };
}

function b64url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}
