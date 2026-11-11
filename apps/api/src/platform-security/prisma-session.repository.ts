import { Injectable } from "@nestjs/common";
import type { SessionRecord, SessionRepository } from "@idbrf/shared";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class PrismaSessionRepository implements SessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async insert(row: SessionRecord): Promise<void> {
    await this.prisma.authSession.create({ data: row });
  }

  async findByRefreshHash(hash: string): Promise<SessionRecord | null> {
    return this.prisma.authSession.findUnique({ where: { refreshTokenHash: hash } });
  }

  async findById(id: string): Promise<SessionRecord | null> {
    return this.prisma.authSession.findUnique({ where: { id } });
  }

  async compareAndRevoke(
    id: string,
    patch: { revokedAt: Date; revokeReason: string; replacedById: string | null },
  ): Promise<boolean> {
    const result = await this.prisma.authSession.updateMany({
      where: { id, status: "ACTIVE" },
      data: {
        status: "REVOKED",
        revokedAt: patch.revokedAt,
        revokeReason: patch.revokeReason,
        replacedById: patch.replacedById,
      },
    });
    return result.count === 1;
  }

  async revokeFamily(familyId: string, reason: string, now: Date): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: { familyId, status: "ACTIVE" },
      data: { status: "REVOKED", revokedAt: now, revokeReason: reason },
    });
  }

  async revokeAllForUser(userId: string, reason: string, now: Date): Promise<number> {
    const result = await this.prisma.authSession.updateMany({
      where: { userId, status: "ACTIVE" },
      data: { status: "REVOKED", revokedAt: now, revokeReason: reason },
    });
    return result.count;
  }
}
