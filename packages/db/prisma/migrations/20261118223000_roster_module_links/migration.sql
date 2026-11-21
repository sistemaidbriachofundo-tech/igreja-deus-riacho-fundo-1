-- Vínculos de módulo, aceite individual, capacidade do culto e entregas.
-- Aditiva e reexecutável: não reabre vínculo encerrado nem duplica par já gravado.

DO $$ BEGIN
  CREATE TYPE "RosterModuleLinkStatus" AS ENUM ('ATIVO', 'ENCERRADO');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ministry_roster_module_leaders" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "church_id" TEXT NOT NULL,
  "ministry_id" TEXT NOT NULL,
  "module_id" TEXT NOT NULL,
  "person_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ministry_roster_module_leaders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ministry_roster_module_memberships" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "church_id" TEXT NOT NULL,
  "ministry_id" TEXT NOT NULL,
  "membership_id" TEXT NOT NULL,
  "module_id" TEXT NOT NULL,
  "person_id" TEXT NOT NULL,
  "status" "RosterModuleLinkStatus" NOT NULL DEFAULT 'ATIVO',
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ended_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ministry_roster_module_memberships_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "roster_assignment_responses" (
  "id" TEXT NOT NULL,
  "assignment_id" TEXT NOT NULL,
  "person_id" TEXT NOT NULL,
  "status" "RosterAssignmentStatus" NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "roster_assignment_responses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "roster_capacity_overrides" (
  "roster_id" TEXT NOT NULL,
  "group_key" TEXT NOT NULL,
  "count" INTEGER NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "roster_capacity_overrides_pkey" PRIMARY KEY ("roster_id", "group_key")
);

CREATE TABLE IF NOT EXISTS "roster_notice_deliveries" (
  "id" TEXT NOT NULL,
  "church_id" TEXT NOT NULL,
  "notice_id" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "dedupe_key" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "roster_notice_deliveries_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ministry_roster_modules" ADD COLUMN IF NOT EXISTS "location_name" TEXT;
ALTER TABLE "ministry_roster_modules" ADD COLUMN IF NOT EXISTS "arrival_contact_name" TEXT;
ALTER TABLE "ministry_roster_modules" ADD COLUMN IF NOT EXISTS "arrival_instructions" TEXT;
ALTER TABLE "rosters" ADD COLUMN IF NOT EXISTS "location_name" TEXT;
ALTER TABLE "rosters" ADD COLUMN IF NOT EXISTS "arrival_contact_name" TEXT;
ALTER TABLE "rosters" ADD COLUMN IF NOT EXISTS "arrival_instructions" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "ministry_roster_module_leaders_module_id_person_id_key"
  ON "ministry_roster_module_leaders"("module_id", "person_id");
CREATE INDEX IF NOT EXISTS "ministry_roster_module_leaders_person_id_ministry_id_idx"
  ON "ministry_roster_module_leaders"("person_id", "ministry_id");
CREATE INDEX IF NOT EXISTS "ministry_roster_module_leaders_church_id_ministry_id_idx"
  ON "ministry_roster_module_leaders"("church_id", "ministry_id");
CREATE UNIQUE INDEX IF NOT EXISTS "ministry_roster_module_memberships_membership_id_module_id_key"
  ON "ministry_roster_module_memberships"("membership_id", "module_id");
CREATE INDEX IF NOT EXISTS "ministry_roster_module_memberships_module_id_status_idx"
  ON "ministry_roster_module_memberships"("module_id", "status");
CREATE INDEX IF NOT EXISTS "ministry_roster_module_memberships_person_id_ministry_id_status_idx"
  ON "ministry_roster_module_memberships"("person_id", "ministry_id", "status");
CREATE INDEX IF NOT EXISTS "roster_assignment_responses_assignment_id_person_id_created_at_idx"
  ON "roster_assignment_responses"("assignment_id", "person_id", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "roster_notice_deliveries_dedupe_key_key"
  ON "roster_notice_deliveries"("dedupe_key");
CREATE INDEX IF NOT EXISTS "roster_notice_deliveries_notice_id_idx"
  ON "roster_notice_deliveries"("notice_id");

DO $$ BEGIN
  ALTER TABLE "ministry_roster_module_leaders" ADD CONSTRAINT "ministry_roster_module_leaders_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ministry_roster_module_leaders" ADD CONSTRAINT "ministry_roster_module_leaders_church_id_fkey"
    FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ministry_roster_module_leaders" ADD CONSTRAINT "ministry_roster_module_leaders_ministry_id_fkey"
    FOREIGN KEY ("ministry_id") REFERENCES "ministries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ministry_roster_module_leaders" ADD CONSTRAINT "ministry_roster_module_leaders_module_id_fkey"
    FOREIGN KEY ("module_id") REFERENCES "ministry_roster_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ministry_roster_module_leaders" ADD CONSTRAINT "ministry_roster_module_leaders_person_id_fkey"
    FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ministry_roster_module_memberships" ADD CONSTRAINT "ministry_roster_module_memberships_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ministry_roster_module_memberships" ADD CONSTRAINT "ministry_roster_module_memberships_church_id_fkey"
    FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ministry_roster_module_memberships" ADD CONSTRAINT "ministry_roster_module_memberships_ministry_id_fkey"
    FOREIGN KEY ("ministry_id") REFERENCES "ministries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ministry_roster_module_memberships" ADD CONSTRAINT "ministry_roster_module_memberships_membership_id_fkey"
    FOREIGN KEY ("membership_id") REFERENCES "ministry_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ministry_roster_module_memberships" ADD CONSTRAINT "ministry_roster_module_memberships_module_id_fkey"
    FOREIGN KEY ("module_id") REFERENCES "ministry_roster_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ministry_roster_module_memberships" ADD CONSTRAINT "ministry_roster_module_memberships_person_id_fkey"
    FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "roster_assignment_responses" ADD CONSTRAINT "roster_assignment_responses_assignment_id_fkey"
    FOREIGN KEY ("assignment_id") REFERENCES "roster_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "roster_assignment_responses" ADD CONSTRAINT "roster_assignment_responses_person_id_fkey"
    FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "roster_capacity_overrides" ADD CONSTRAINT "roster_capacity_overrides_roster_id_fkey"
    FOREIGN KEY ("roster_id") REFERENCES "rosters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "roster_notice_deliveries" ADD CONSTRAINT "roster_notice_deliveries_church_id_fkey"
    FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Migra somente volunteerIds explícitos de integrante ativo. Não atribui módulo por cargo ou por ausência da chave.
INSERT INTO "ministry_roster_module_memberships" (
  "id", "organization_id", "church_id", "ministry_id", "membership_id", "module_id", "person_id",
  "status", "started_at", "created_at", "updated_at"
)
SELECT
  'link_' || md5(membership.id || ':' || module.id),
  membership.organization_id,
  membership.church_id,
  membership.ministry_id,
  membership.id,
  module.id,
  membership.person_id,
  'ATIVO',
  COALESCE(membership.started_at, CURRENT_TIMESTAMP),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "ministry_roster_modules" module
JOIN "ministry_memberships" membership
  ON membership.ministry_id = module.ministry_id
 AND membership.status = 'ATIVO'
 AND membership.ended_at IS NULL
JOIN "persons" person
  ON person.id = membership.person_id
 AND person.status = 'ACTIVE'
WHERE (module.rules::jsonb) ? 'volunteerIds'
  AND jsonb_typeof(module.rules::jsonb -> 'volunteerIds') = 'array'
  AND membership.person_id IN (
    SELECT jsonb_array_elements_text(module.rules::jsonb -> 'volunteerIds')
  )
ON CONFLICT ("membership_id", "module_id") DO NOTHING;
