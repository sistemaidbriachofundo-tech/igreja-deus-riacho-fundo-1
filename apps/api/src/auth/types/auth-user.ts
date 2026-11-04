import type { AuthGrant, PersonId, UserId } from "@idbrf/shared";

/** Payload mínimo do JWT / request autenticado. */
export interface AuthUser {
  userId: UserId;
  personId: PersonId;
  email: string;
  grants: AuthGrant[];
}

export interface JwtPayload {
  sub: UserId;
  personId: PersonId;
  email: string;
  grants: AuthGrant[];
}
