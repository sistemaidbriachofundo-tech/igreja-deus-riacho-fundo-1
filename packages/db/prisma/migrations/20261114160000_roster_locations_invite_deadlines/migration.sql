ALTER TABLE "roster_slots"
  ADD COLUMN "sector" TEXT,
  ADD COLUMN "zone" TEXT,
  ADD COLUMN "side" TEXT;

ALTER TABLE "roster_notices"
  ADD COLUMN "expires_at" TIMESTAMP(3),
  ADD COLUMN "push_receipts" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "roster_notices"
SET "expires_at" = "created_at" + INTERVAL '12 hours'
WHERE "kind" = 'substitute';

ALTER TABLE "volunteer_availabilities" ADD COLUMN "group_id" TEXT;
