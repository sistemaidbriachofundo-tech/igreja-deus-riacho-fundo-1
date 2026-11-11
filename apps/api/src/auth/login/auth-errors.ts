import { HttpException, HttpStatus, UnauthorizedException } from "@nestjs/common";

export const PUBLIC_CREDENTIALS_MESSAGE = "Credenciais inválidas";
export const PUBLIC_MFA_MESSAGE = "Não foi possível concluir a verificação";
export const PUBLIC_TOKEN_MESSAGE = "Token JWT inválido";

export function authHttp(
  status: 401 | 429,
  code: string,
  message: string,
): HttpException {
  const body = { statusCode: status, message, code };
  if (status === 401) {
    return new UnauthorizedException(body);
  }
  return new HttpException(body, HttpStatus.TOO_MANY_REQUESTS);
}

export function invalidCredentials(): UnauthorizedException {
  return authHttp(401, "INVALID_CREDENTIALS", PUBLIC_CREDENTIALS_MESSAGE) as UnauthorizedException;
}

export function mfaFailure(code: "MFA_INVALID" | "MFA_REPLAY" | "MFA_EXPIRED"): UnauthorizedException {
  return authHttp(401, code, PUBLIC_MFA_MESSAGE) as UnauthorizedException;
}

export function tokenFailure(
  code:
    | "SESSION_INVALID"
    | "SESSION_REVOKED"
    | "SESSION_EXPIRED"
    | "SESSION_REPLAY"
    | "SESSION_MFA_REQUIRED"
    | "AUTHZ_STALE"
    | "USER_INACTIVE",
): UnauthorizedException {
  return authHttp(401, code, PUBLIC_TOKEN_MESSAGE) as UnauthorizedException;
}

const SENSITIVE_AUDIT_KEY =
  /password|token|secret|otpauth|authorization|cookie|jwt|challenge|code|hash/i;

/** Remove campos que não podem ir para trilha nem log. */
export function sanitizeAuditMetadata(
  metadata: Record<string, unknown>,
): Record<string, string | number | boolean | null> {
  const safe: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (SENSITIVE_AUDIT_KEY.test(key)) {
      continue;
    }
    if (
      typeof value === "string" &&
      (value.length > 120 || /otpauth:|bearer\s/i.test(value))
    ) {
      continue;
    }
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      safe[key] = value;
    }
  }
  return safe;
}
