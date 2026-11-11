import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { PrismaService } from "../prisma/prisma.service";
import { ChurchAccessController } from "./church-access.controller";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { RolesGuard } from "./guards/roles.guard";
import { ScopeGuard } from "./guards/scope.guard";
import { AccessPolicyGuard } from "./guards/access-policy.guard";
import {
  InMemoryAuthAttemptLimiter,
  PrismaAuthAttemptLimiter,
} from "./login/auth-attempt-limiter";
import {
  InMemoryMfaChallengeStore,
  PrismaMfaChallengeStore,
} from "./mfa/mfa-challenge.store";
import { AuthClock } from "./session/auth-clock";
import {
  AUTH_ATTEMPT_LIMITER,
  MFA_CHALLENGE_STORE,
  SESSION_STORE,
  usesDurableAuthState,
} from "./session/auth-state.tokens";
import {
  InMemorySessionStore,
  PrismaSessionStore,
} from "./session/session-store";

/**
 * Store padrão: memória do processo (QA single-node, sem migration).
 * AUTH_STATE_STORE=prisma só depois da migration proposta em session-store.ts
 * (integrador #189). Sem as tabelas o adapter responde 503 e não emite JWT.
 */
@Module({
  controllers: [AuthController, ChurchAccessController],
  providers: [
    AuthClock,
    {
      provide: SESSION_STORE,
      inject: [AuthClock, PrismaService],
      useFactory: (clock: AuthClock, prisma: PrismaService) =>
        usesDurableAuthState()
          ? new PrismaSessionStore(prisma, clock)
          : new InMemorySessionStore(clock),
    },
    {
      provide: MFA_CHALLENGE_STORE,
      inject: [AuthClock, PrismaService],
      useFactory: (clock: AuthClock, prisma: PrismaService) =>
        usesDurableAuthState()
          ? new PrismaMfaChallengeStore(prisma, clock)
          : new InMemoryMfaChallengeStore(clock),
    },
    {
      provide: AUTH_ATTEMPT_LIMITER,
      inject: [AuthClock, PrismaService],
      useFactory: (clock: AuthClock, prisma: PrismaService) =>
        usesDurableAuthState()
          ? new PrismaAuthAttemptLimiter(prisma, clock)
          : new InMemoryAuthAttemptLimiter(clock),
    },
    AuthService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ScopeGuard },
    { provide: APP_GUARD, useClass: AccessPolicyGuard },
  ],
  exports: [AuthService],
})
export class AuthModule {}
