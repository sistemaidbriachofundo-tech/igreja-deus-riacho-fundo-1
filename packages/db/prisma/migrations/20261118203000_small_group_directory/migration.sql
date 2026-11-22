ALTER TABLE "small_groups"
  ADD COLUMN "meeting_address" TEXT,
  ADD COLUMN "photo_url" TEXT,
  ADD COLUMN "contact_whatsapp" TEXT,
  ADD COLUMN "public_listed" BOOLEAN NOT NULL DEFAULT FALSE;
