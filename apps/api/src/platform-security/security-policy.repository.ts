import { Injectable } from "@nestjs/common";
import {
  assertRuntimePolicy,
  DEFAULT_SECURITY_POLICY,
  policyScopeKey,
  type SecurityPolicySnapshot,
} from "@idbrf/shared/security";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class SecurityPolicyRepository {
  constructor(private readonly prisma: PrismaService) {}

  async current(organizationId?: string | null): Promise<SecurityPolicySnapshot> {
    const row = await this.prisma.securityPolicy.findUnique({
      where: { scopeKey: policyScopeKey(organizationId) },
    });
    const policy: SecurityPolicySnapshot = row
      ? {
          version: row.version,
          mfaEnforcement: row.mfaEnforcement,
          privilegedRoleCodes: row.privilegedRoleCodes,
        }
      : DEFAULT_SECURITY_POLICY;
    assertRuntimePolicy(process.env.IDBRF_RUNTIME_STAGE, policy);
    return policy;
  }

  async bump(organizationId?: string | null): Promise<SecurityPolicySnapshot> {
    const scopeKey = policyScopeKey(organizationId);
    const existing = await this.current(organizationId);
    const row = await this.prisma.securityPolicy.upsert({
      where: { scopeKey },
      create: {
        scopeKey,
        organizationId: organizationId ?? null,
        version: existing.version + 1,
        mfaEnforcement: existing.mfaEnforcement,
        privilegedRoleCodes: [...existing.privilegedRoleCodes],
      },
      update: { version: { increment: 1 } },
    });
    return {
      version: row.version,
      mfaEnforcement: row.mfaEnforcement,
      privilegedRoleCodes: row.privilegedRoleCodes,
    };
  }
}
