-- Alinha DEFAULT do banco ao schema Prisma (PENDING_ADMISSION).
-- Evita inserts sem status explícito virarem ACTIVE silenciosamente.

ALTER TABLE "church_memberships"
  ALTER COLUMN "status" SET DEFAULT 'PENDING_ADMISSION'::"MembershipStatus";
