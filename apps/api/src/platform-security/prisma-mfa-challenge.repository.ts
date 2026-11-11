import { Injectable } from "@nestjs/common";
import type { MfaChallengeRecord, MfaChallengeRepository } from "@idbrf/shared/security";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class PrismaMfaChallengeRepository implements MfaChallengeRepository {
  constructor(private readonly prisma: PrismaService) {}

  async insert(row: MfaChallengeRecord): Promise<void> {
    await this.prisma.mfaChallenge.create({ data: row });
  }

  async findByTokenHash(hash: string): Promise<MfaChallengeRecord | null> {
    return this.prisma.mfaChallenge.findUnique({ where: { tokenHash: hash } });
  }

  async consumePending(hash: string, now: Date): Promise<number> {
    return this.prisma.$executeRaw`
      UPDATE mfa_challenges
      SET status = 'CONSUMED', consumed_at = ${now}
      WHERE token_hash = ${hash}
        AND status = 'PENDING'
        AND expires_at > ${now}
        AND attempt_count < max_attempts
    `;
  }

  async registerFailure(hash: string, now: Date): Promise<MfaChallengeRecord | null> {
    const rows = await this.prisma.$queryRaw<MfaChallengeRecord[]>`
      UPDATE mfa_challenges
      SET
        attempt_count = CASE
          WHEN status = 'PENDING' AND expires_at > ${now} THEN attempt_count + 1
          ELSE attempt_count
        END,
        status = CASE
          WHEN status <> 'PENDING' THEN status
          WHEN expires_at <= ${now} THEN 'EXPIRED'::"MfaChallengeStatus"
          WHEN attempt_count + 1 >= max_attempts THEN 'REVOKED'::"MfaChallengeStatus"
          ELSE status
        END
      WHERE token_hash = ${hash}
      RETURNING
        id,
        user_id AS "userId",
        purpose::text AS purpose,
        status::text AS status,
        token_hash AS "tokenHash",
        expires_at AS "expiresAt",
        consumed_at AS "consumedAt",
        attempt_count AS "attemptCount",
        max_attempts AS "maxAttempts"
    `;
    return rows[0] ?? null;
  }
}
