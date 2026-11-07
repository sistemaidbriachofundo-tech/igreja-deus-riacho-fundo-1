import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import * as argon2 from "argon2";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
  assertPersonId,
  canAccessChurch,
  resolveDefaultActiveContext,
  type AuthGrant,
} from "@idbrf/shared";
import { PrismaService } from "../prisma/prisma.service";
import { PilotService } from "../pilot/pilot.service";
import {
  JWT_DEV_FALLBACK_SECRET,
  JWT_SECRET_MIN_LENGTH,
} from "./auth.constants";
import type { AuthUser, JwtPayload } from "./types/auth-user";

interface LoginInput {
  email: string;
  password: string;
}

interface TokenPair {
  accessToken: string;
  tokenType: "Bearer";
  expiresInSeconds: number;
  user: AuthUser;
  mfa?: {
    enabled: boolean;
    required: boolean;
    challengeRequired: boolean;
    oidcLive: false;
  };
}

/**
 * Autenticação JWT (estratégia documentada no README § F1 IAM).
 * MFA TOTP local disponível; OIDC = config/hooks sem IdP live.
 * F6: claims organizationId/churchId + refresh/switch para clientes mobile-ready.
 */
@Injectable()
export class AuthService {
  private readonly expiresInSeconds = Number(
    process.env.JWT_EXPIRES_SECONDS ?? 3600,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly pilot: PilotService,
  ) {}

  async login(input: LoginInput): Promise<TokenPair> {
    const email = input.email.trim().toLowerCase();
    const emailFingerprint = createHash("sha256")
      .update(email, "utf8")
      .digest("hex")
      .slice(0, 16);
    const pilot = await this.pilot.getPilotChurch();

    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        person: true,
        grants: { include: { role: true } },
        mfaFactors: {
          where: { factorType: "TOTP", status: "ENABLED" },
          select: { id: true },
        },
      },
    });

    if (!user || user.status !== "ACTIVE") {
      await this.writeLoginAudit({
        actorUserId: null,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        action: "auth.login_failed",
        metadata: { reason: "invalid_user", emailFingerprint },
      });
      throw new UnauthorizedException("Credenciais inválidas");
    }

    if (!(await verifyPassword(input.password, user.passwordHash))) {
      await this.writeLoginAudit({
        actorUserId: user.id,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        action: "auth.login_failed",
        metadata: { reason: "invalid_password", emailFingerprint },
      });
      throw new UnauthorizedException("Credenciais inválidas");
    }

    const personId = assertPersonId(user.personId);
    const grants = mapGrants(user.grants);
    const active = resolveDefaultActiveContext(grants, pilot);

    const authUser: AuthUser = {
      userId: user.id,
      personId,
      email: user.email,
      grants,
      organizationId: active.organizationId,
      churchId: active.churchId,
    };

    const mfaEnabled = user.mfaFactors.length > 0;
    const mfaRequired = user.mfaRequired;

    await this.writeLoginAudit({
      actorUserId: user.id,
      organizationId: active.organizationId,
      churchId: active.churchId,
      action: "auth.login",
      metadata: {
        emailFingerprint,
        mfaEnabled,
        mfaRequired,
        // sem senha / sem e-mail em claro
      },
    });

    return {
      ...this.issueTokenPair(authUser),
      /** Hint MFA — challenge hard ainda não bloqueia JWT neste contrato. */
      mfa: {
        enabled: mfaEnabled,
        required: mfaRequired,
        challengeRequired: mfaRequired && mfaEnabled,
        oidcLive: false as const,
      },
    };
  }

  /** Auditoria de login sem PII (e-mail só como fingerprint curto). */
  private async writeLoginAudit(input: {
    actorUserId: string | null;
    organizationId: string | null;
    churchId: string | null;
    action: "auth.login" | "auth.login_failed";
    metadata: {
      emailFingerprint: string;
      reason?: string;
      mfaEnabled?: boolean;
      mfaRequired?: boolean;
    };
  }): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorUserId: input.actorUserId,
        action: input.action,
        resourceType: "auth",
        resourceId: input.actorUserId,
        organizationId: input.organizationId,
        churchId: input.churchId,
        metadata: input.metadata,
      },
    });
  }

  /**
   * Reemite access token com grants atuais do DB (mobile refresh).
   * Mantém churchId ativo se o grant ainda cobrir; senão volta ao default RF1.
   */
  async refresh(actor: AuthUser): Promise<TokenPair> {
    const loaded = await this.loadUserGrants(actor.userId);
    const pilot = await this.pilot.getPilotChurch();

    let organizationId = actor.organizationId;
    let churchId = actor.churchId;

    if (
      organizationId &&
      churchId &&
      canAccessChurch(loaded.grants, { organizationId, churchId })
    ) {
      // mantém contexto ativo
    } else {
      const active = resolveDefaultActiveContext(loaded.grants, pilot);
      organizationId = active.organizationId;
      churchId = active.churchId;
    }

    return this.issueTokenPair({
      userId: loaded.userId,
      personId: loaded.personId,
      email: loaded.email,
      grants: loaded.grants,
      organizationId,
      churchId,
    });
  }

  /**
   * Troca congregação ativa — só se algum grant cobrir a church alvo.
   * Produto single-church permanece RF1 por default; switch é opt-in.
   */
  async switchChurch(actor: AuthUser, churchId: string): Promise<TokenPair> {
    const loaded = await this.loadUserGrants(actor.userId);
    const church = await this.prisma.church.findUnique({
      where: { id: churchId },
    });
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

    return this.issueTokenPair({
      userId: loaded.userId,
      personId: loaded.personId,
      email: loaded.email,
      grants: loaded.grants,
      organizationId: church.organizationId,
      churchId: church.id,
    });
  }

  verifyAccessToken(token: string): AuthUser {
    const payload = verifyJwt(token, this.jwtSecret());
    const personId = assertPersonId(payload.personId);
    return {
      userId: payload.sub,
      personId,
      email: payload.email,
      grants: payload.grants ?? [],
      organizationId: payload.organizationId ?? null,
      churchId: payload.churchId ?? null,
    };
  }

  signAccessToken(payload: JwtPayload): string {
    return signJwt(payload, this.jwtSecret(), this.expiresInSeconds);
  }

  private issueTokenPair(authUser: AuthUser): TokenPair {
    const accessToken = this.signAccessToken({
      sub: authUser.userId,
      personId: authUser.personId,
      email: authUser.email,
      grants: authUser.grants,
      organizationId: authUser.organizationId,
      churchId: authUser.churchId,
    });

    return {
      accessToken,
      tokenType: "Bearer",
      expiresInSeconds: this.expiresInSeconds,
      user: authUser,
    };
  }

  private async loadUserGrants(userId: string): Promise<{
    userId: string;
    personId: string;
    email: string;
    grants: AuthGrant[];
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { grants: { include: { role: true } } },
    });
    if (!user || user.status !== "ACTIVE") {
      throw new UnauthorizedException("Usuário inativo ou inexistente");
    }
    return {
      userId: user.id,
      personId: assertPersonId(user.personId),
      email: user.email,
      grants: mapGrants(user.grants),
    };
  }

  private jwtSecret(): string {
    return resolveJwtSecret(process.env.JWT_SECRET, process.env.NODE_ENV);
  }
}

function mapGrants(
  grants: Array<{
    organizationId: string | null;
    churchId: string | null;
    ministryId: string | null;
    role: { code: string };
  }>,
): AuthGrant[] {
  return grants.map((g) => ({
    roleCode: g.role.code,
    organizationId: g.organizationId,
    churchId: g.churchId,
    ministryId: g.ministryId ?? null,
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

  if (storedHash.startsWith("$argon2id$") || storedHash.startsWith("$argon2i$") || storedHash.startsWith("$argon2d$")) {
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

  // DEV/CI only — produção falha acima
  return JWT_DEV_FALLBACK_SECRET;
}

function signJwt(
  payload: JwtPayload,
  secret: string,
  expiresInSeconds: number,
): string {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
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

function verifyJwt(token: string, secret: string): JwtPayload & { exp?: number; iat?: number } {
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
  const now = Math.floor(Date.now() / 1000);
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
  return payload;
}

function b64url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}
