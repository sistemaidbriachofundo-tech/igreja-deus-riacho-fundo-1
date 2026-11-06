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
}

export interface JwtPayload {
  sub: UserId;
  personId: PersonId;
  email: string;
  grants: AuthGrant[];
  organizationId?: string | null;
  churchId?: string | null;
}
