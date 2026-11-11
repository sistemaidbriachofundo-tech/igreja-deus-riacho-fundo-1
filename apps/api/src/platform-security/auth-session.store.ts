import { Injectable } from "@nestjs/common";
import { SessionService } from "@idbrf/shared";
import { PrismaService } from "../prisma/prisma.service";
import { PrismaSessionRepository } from "./prisma-session.repository";
import { SecurityPolicyRepository } from "./security-policy.repository";

@Injectable()
export class AuthSessionStore {
  readonly sessions: SessionService;

  constructor(
    private readonly prisma: PrismaService,
    repository: PrismaSessionRepository,
    private readonly policies: SecurityPolicyRepository,
  ) {
    this.sessions = new SessionService(repository);
  }

  async bumpUserAuthz(userId: string, reason = "authz_changed"): Promise<number> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { authzVersion: { increment: 1 } },
      select: { authzVersion: true },
    });
    await this.sessions.revokeAll(userId, reason);
    return user.authzVersion;
  }

  currentPolicy(organizationId?: string | null) {
    return this.policies.current(organizationId);
  }
}
