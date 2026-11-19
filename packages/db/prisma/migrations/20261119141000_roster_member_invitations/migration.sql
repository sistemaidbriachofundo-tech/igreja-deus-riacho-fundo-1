DO $$ BEGIN
  CREATE TYPE "RosterMemberInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ministry_roster_member_invitations" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "church_id" TEXT NOT NULL,
  "ministry_id" TEXT NOT NULL,
  "module_id" TEXT NOT NULL,
  "membership_id" TEXT NOT NULL,
  "person_id" TEXT NOT NULL,
  "status" "RosterMemberInvitationStatus" NOT NULL DEFAULT 'PENDING',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "responded_at" TIMESTAMP(3),
  CONSTRAINT "ministry_roster_member_invitations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ministry_roster_member_invitations_ministry_id_status_idx"
  ON "ministry_roster_member_invitations"("ministry_id", "status");
CREATE INDEX IF NOT EXISTS "ministry_roster_member_invitations_person_id_status_idx"
  ON "ministry_roster_member_invitations"("person_id", "status");
CREATE INDEX IF NOT EXISTS "ministry_roster_member_invitations_module_id_person_id_status_idx"
  ON "ministry_roster_member_invitations"("module_id", "person_id", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "ministry_roster_member_invitations_one_pending"
  ON "ministry_roster_member_invitations"("module_id", "person_id")
  WHERE "status" = 'PENDING';

DO $$ BEGIN
  ALTER TABLE "ministry_roster_member_invitations"
    ADD CONSTRAINT "ministry_roster_member_invitations_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "ministry_roster_member_invitations"
    ADD CONSTRAINT "ministry_roster_member_invitations_church_id_fkey"
    FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "ministry_roster_member_invitations"
    ADD CONSTRAINT "ministry_roster_member_invitations_ministry_id_fkey"
    FOREIGN KEY ("ministry_id") REFERENCES "ministries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "ministry_roster_member_invitations"
    ADD CONSTRAINT "ministry_roster_member_invitations_module_id_fkey"
    FOREIGN KEY ("module_id") REFERENCES "ministry_roster_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "ministry_roster_member_invitations"
    ADD CONSTRAINT "ministry_roster_member_invitations_membership_id_fkey"
    FOREIGN KEY ("membership_id") REFERENCES "ministry_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "ministry_roster_member_invitations"
    ADD CONSTRAINT "ministry_roster_member_invitations_person_id_fkey"
    FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
