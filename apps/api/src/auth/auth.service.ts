import {
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import * as argon2 from "argon2";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { assertPersonId, type AuthGrant } from "@idbrf/shared";
import { PrismaService } from "../prisma/prisma.service";
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
}

/**
 * Autenticação JWT (estratégia documentada no README § F1 IAM).
 * Skeleton: HMAC-SHA256 local; OIDC/MFA entram quando o provedor for definido.
 */
@Injectable()
export class AuthService {
  private readonly expiresInSeconds = Number(
    process.env.JWT_EXPIRES_SECONDS ?? 3600,
  );

  constructor(private readonly prisma: PrismaService) {}

  async login(input: LoginInput): Promise<TokenPair> {
    const email = input.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        person: true,
        grants: { include: { role: true } },
      },
    });

    if (!user || user.status !== "ACTIVE") {
      throw new UnauthorizedException("Credenciais inválidas");
    }

    if (!(await verifyPassword(input.password, user.passwordHash))) {
      throw new UnauthorizedException("Credenciais inválidas");
    }

    const personId = assertPersonId(user.personId);
    const grants: AuthGrant[] = user.grants.map((g) => ({
      roleCode: g.role.code,
      organizationId: g.organizationId,
      churchId: g.churchId,
      ministryId: g.ministryId ?? null,
    }));

    const authUser: AuthUser = {
      userId: user.id,
      personId,
      email: user.email,
      grants,
    };

    const accessToken = this.signAccessToken({
      sub: user.id,
      personId,
      email: user.email,
      grants,
    });

    return {
      accessToken,
      tokenType: "Bearer",
      expiresInSeconds: this.expiresInSeconds,
      user: authUser,
    };
  }

  verifyAccessToken(token: string): AuthUser {
    const payload = verifyJwt(token, this.jwtSecret());
    const personId = assertPersonId(payload.personId);
    return {
      userId: payload.sub,
      personId,
      email: payload.email,
      grants: payload.grants ?? [],
    };
  }

  signAccessToken(payload: JwtPayload): string {
    return signJwt(payload, this.jwtSecret(), this.expiresInSeconds);
  }

  private jwtSecret(): string {
    return resolveJwtSecret(process.env.JWT_SECRET, process.env.NODE_ENV);
  }
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
  ) as { alg?: unknown; typ?: unknown };
  if (header?.alg !== "HS256" || header?.typ !== "JWT") {
    throw new Error("Algoritmo JWT não permitido");
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
  if (typeof payload.iat !== "number" || !Number.isSafeInteger(payload.iat) || payload.iat > now + 60) {
    throw new Error("JWT com emissão inválida");
  }
  if (
    typeof payload.sub !== "string" || !payload.sub.trim() ||
    typeof payload.email !== "string" || !payload.email.trim() ||
    !Array.isArray(payload.grants)
  ) {
    throw new Error("Claims JWT inválidas");
  }
  return payload;
}

function b64url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}
