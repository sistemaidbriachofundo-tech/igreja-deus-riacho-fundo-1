import type { AuthGrant, PersonId, UserId } from "@idbrf/shared";

/** Payload mínimo do JWT / request autenticado (F6: claims de congregação ativa). */
export interface AuthUser {
  userId: UserId;
  personId: PersonId;
  email: string;
  grants: AuthGrant[];
  /** Organização ativa no token (mobile / switch). Ausente em tokens legados. */
  organizationId?: string | null;
  /** Congregação ativa no token — default RF1 no login. */
  churchId?: string | null;
  /** Sessão opaca revogável. Ausente em JWT sem sid (rejeitado). */
  sessionId?: string;
  /** Fingerprint de grants/status/fator no momento da emissão. */
  authzVersion?: string;
}

export interface JwtPayload {
  sub: UserId;
  personId: PersonId;
  email: string;
  grants: AuthGrant[];
  organizationId?: string | null;
  churchId?: string | null;
  /** Identificador opaco da sessão (não é o hash persistido). */
  sid?: string;
  /** Versão de autorização gravada na sessão. */
  av?: string;
}
