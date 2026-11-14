import { ConflictException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { PrismaService } from "../prisma/prisma.service";
import { churchDayBounds } from "./church-day";

const MAX_ATTEMPTS = 3;

export async function writeRosterAssignment<T>(
  prisma: PrismaService,
  write: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await prisma.$transaction(write, { isolationLevel: "Serializable" });
    } catch (error) {
      if (!error || typeof error !== "object" || !("code" in error) || error.code !== "P2034") {
        throw error;
      }
    }
  }
  throw new ConflictException({
    code: "ROSTER_WRITE_CONFLICT",
    message: "A escala foi alterada enquanto você trabalhava. Atualize a escala e tente novamente.",
  });
}

export async function assertNoRosterDayConflict(
  db: Pick<Prisma.TransactionClient, "rosterAssignment">,
  input: {
    churchId: string;
    serviceAt: Date;
    personIds: string[];
    excludeAssignmentId?: string;
    excludeRosterId?: string;
    conflictCode: "ROSTER_SAME_DAY" | "ROSTER_SERVICE_CONFLICT";
  },
): Promise<void> {
  if (!input.personIds.length) return;

  const { start, end } = churchDayBounds(input.serviceAt);
  const conflicts = await db.rosterAssignment.findMany({
    where: {
      status: { in: ["PENDING", "CONFIRMED"] },
      id: input.excludeAssignmentId ? { not: input.excludeAssignmentId } : undefined,
      OR: [
        { personId: { in: input.personIds } },
        { partnerPersonId: { in: input.personIds } },
      ],
      slot: {
        roster: {
          id: input.excludeRosterId ? { not: input.excludeRosterId } : undefined,
          churchId: input.churchId,
          serviceAt: { gte: start, lt: end },
        },
      },
    },
    select: { id: true },
    take: 1,
  });
  if (conflicts.length) {
    throw new ConflictException({
      code: input.conflictCode,
      message: "Esta pessoa já tem posição ativa no mesmo dia nesta congregação.",
    });
  }
}
