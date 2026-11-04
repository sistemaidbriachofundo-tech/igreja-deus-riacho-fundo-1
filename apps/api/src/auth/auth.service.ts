import {
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { assertPersonId, type AuthGrant } from "@idbrf/shared";
import { PrismaService } from "../prisma/prisma.service";
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

    if (!verifyPassword(input.password, user.passwordHash)) {
      throw new UnauthorizedException("Credenciais inválidas");
    }

    const personId = assertPersonId(user.personId);
    const grants: AuthGrant[] = user.grants.map((g) => ({
      roleCode: g.role.code,
      organizationId: g.organizationId,
      churchId: g.churchId,
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
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 16) {
      // DEV/CI only — produção deve definir JWT_SECRET forte
      return "dev-only-jwt-secret-change-me";
    }
    return secret;
  }
}

/** Hash demo compatível com o seed (`sha256:<hex>`). Trocar por Argon2id. */
export function hashPasswordDemo(password: string): string {
  const hex = createHash("sha256").update(password, "utf8").digest("hex");
  return `sha256:${hex}`;
}

export function verifyPassword(
  password: string,
  storedHash: string | null | undefined,
): boolean {
  if (!storedHash?.startsWith("sha256:")) {
    return false;
  }
  const expected = storedHash.slice("sha256:".length);
  const actual = createHash("sha256").update(password, "utf8").digest("hex");
  if (expected.length !== actual.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
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

function verifyJwt(token: string, secret: string): JwtPayload & { exp?: number } {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("JWT malformado");
  }
  const [encodedHeader, encodedPayload, signature] = parts;
  const data = `${encodedHeader}.${encodedPayload}`;
  const expected = createHmac("sha256", secret).update(data).digest("base64url");
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    throw new Error("Assinatura JWT inválida");
  }
  const payload = JSON.parse(
    Buffer.from(encodedPayload, "base64url").toString("utf8"),
  ) as JwtPayload & { exp?: number };
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("JWT expirado");
  }
  return payload;
}

function b64url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}
