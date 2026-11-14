ALTER TABLE "ministry_roster_modules" ADD COLUMN "rules" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "rosters" ADD COLUMN "service_type" TEXT;
ALTER TABLE "roster_slots" ADD COLUMN "required_qualification" TEXT;

CREATE TABLE "roster_availability_responses" (
  "church_id" TEXT NOT NULL REFERENCES "churches"("id") ON DELETE CASCADE,
  "person_id" TEXT NOT NULL REFERENCES "persons"("id") ON DELETE CASCADE,
  "month" TEXT NOT NULL,
  "roster_ids" TEXT[] NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL,
  PRIMARY KEY ("church_id", "person_id", "month")
);
CREATE INDEX "roster_availability_responses_church_id_month_idx" ON "roster_availability_responses"("church_id", "month");

CREATE TABLE "roster_notices" (
  "id" TEXT PRIMARY KEY,
  "church_id" TEXT NOT NULL REFERENCES "churches"("id") ON DELETE CASCADE,
  "person_id" TEXT NOT NULL REFERENCES "persons"("id") ON DELETE CASCADE,
  "kind" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "sent_at" TIMESTAMP(3),
  "claimed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "roster_notices_church_id_person_id_created_at_idx" ON "roster_notices"("church_id", "person_id", "created_at");
CREATE TABLE "roster_push_subscriptions" (
  "endpoint" TEXT PRIMARY KEY,
  "church_id" TEXT NOT NULL REFERENCES "churches"("id") ON DELETE CASCADE,
  "person_id" TEXT NOT NULL REFERENCES "persons"("id") ON DELETE CASCADE,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "roster_push_subscriptions_church_id_person_id_idx" ON "roster_push_subscriptions"("church_id", "person_id");
