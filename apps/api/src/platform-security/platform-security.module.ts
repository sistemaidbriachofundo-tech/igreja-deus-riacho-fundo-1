import { Global, Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AuditWriterService } from "./audit-writer.service";
import { AuthSessionStore } from "./auth-session.store";
import { MfaChallengeStore } from "./mfa-challenge.store";
import { PrismaMfaChallengeRepository } from "./prisma-mfa-challenge.repository";
import { PrismaRateLimitStore } from "./prisma-rate-limit.repository";
import { PrismaSessionRepository } from "./prisma-session.repository";
import { SecurityPolicyRepository } from "./security-policy.repository";

@Global()
@Module({
  imports: [PrismaModule],
  providers: [
    PrismaSessionRepository,
    PrismaMfaChallengeRepository,
    PrismaRateLimitStore,
    SecurityPolicyRepository,
    AuthSessionStore,
    MfaChallengeStore,
    AuditWriterService,
  ],
  exports: [
    PrismaRateLimitStore,
    SecurityPolicyRepository,
    AuthSessionStore,
    MfaChallengeStore,
    AuditWriterService,
  ],
})
export class PlatformSecurityModule {}
