-- Agenda da congregação e preferências de horário. Aditiva: não altera escalas já gravadas.

CREATE TABLE IF NOT EXISTS "church_service_occurrences" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "church_id" TEXT NOT NULL,
  "service_at" TIMESTAMP(3) NOT NULL,
  "service_type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
  "title" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "church_service_occurrences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "volunteer_serving_preferences" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "church_id" TEXT NOT NULL,
  "person_id" TEXT NOT NULL,
  "only_morning" BOOLEAN NOT NULL DEFAULT false,
  "only_evening" BOOLEAN NOT NULL DEFAULT false,
  "only_first_sunday" BOOLEAN NOT NULL DEFAULT false,
  "only_second_sunday" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "volunteer_serving_preferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "church_service_occurrences_church_id_service_at_key"
  ON "church_service_occurrences"("church_id", "service_at");
CREATE INDEX IF NOT EXISTS "church_service_occurrences_church_id_service_at_idx"
  ON "church_service_occurrences"("church_id", "service_at");
CREATE UNIQUE INDEX IF NOT EXISTS "volunteer_serving_preferences_church_id_person_id_key"
  ON "volunteer_serving_preferences"("church_id", "person_id");

DO $$ BEGIN
  ALTER TABLE "church_service_occurrences" ADD CONSTRAINT "church_service_occurrences_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "church_service_occurrences" ADD CONSTRAINT "church_service_occurrences_church_id_fkey"
    FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "volunteer_serving_preferences" ADD CONSTRAINT "volunteer_serving_preferences_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "volunteer_serving_preferences" ADD CONSTRAINT "volunteer_serving_preferences_church_id_fkey"
    FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "volunteer_serving_preferences" ADD CONSTRAINT "volunteer_serving_preferences_person_id_fkey"
    FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
