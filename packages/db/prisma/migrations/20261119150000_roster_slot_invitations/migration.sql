DO $$ BEGIN
  CREATE TYPE "RosterSlotInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "roster_slot_invitations" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "church_id" TEXT NOT NULL,
  "slot_id" TEXT NOT NULL,
  "person_id" TEXT NOT NULL,
  "partner_person_id" TEXT,
  "status" "RosterSlotInvitationStatus" NOT NULL DEFAULT 'PENDING',
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "responded_at" TIMESTAMP(3),
  CONSTRAINT "roster_slot_invitations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "roster_slot_invitations_slot_id_status_idx" ON "roster_slot_invitations"("slot_id", "status");
CREATE INDEX IF NOT EXISTS "roster_slot_invitations_person_id_status_idx" ON "roster_slot_invitations"("person_id", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "roster_slot_invitations_one_pending"
  ON "roster_slot_invitations"("slot_id", "person_id")
  WHERE "status" = 'PENDING';

DO $$ BEGIN
  ALTER TABLE "roster_slot_invitations" ADD CONSTRAINT "roster_slot_invitations_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "roster_slot_invitations" ADD CONSTRAINT "roster_slot_invitations_church_id_fkey"
    FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "roster_slot_invitations" ADD CONSTRAINT "roster_slot_invitations_slot_id_fkey"
    FOREIGN KEY ("slot_id") REFERENCES "roster_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "roster_slot_invitations" ADD CONSTRAINT "roster_slot_invitations_person_id_fkey"
    FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "roster_slot_invitations" ADD CONSTRAINT "roster_slot_invitations_partner_person_id_fkey"
    FOREIGN KEY ("partner_person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
