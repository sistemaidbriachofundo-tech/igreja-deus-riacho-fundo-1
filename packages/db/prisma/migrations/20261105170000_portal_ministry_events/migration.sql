-- Portal público F3/F4: perfil Ministry + Grant.ministry_id + portal_events

CREATE TYPE "MinistryVisibility" AS ENUM ('PUBLIC', 'INTERNAL');
CREATE TYPE "MinistryPublishStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "PortalEventStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CANCELLED', 'ARCHIVED');

ALTER TABLE "ministries"
  ADD COLUMN "description" TEXT,
  ADD COLUMN "cover_image_url" TEXT,
  ADD COLUMN "gallery_urls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "schedule_text" TEXT,
  ADD COLUMN "leadership_public" JSONB,
  ADD COLUMN "participation_info" TEXT,
  ADD COLUMN "visibility" "MinistryVisibility" NOT NULL DEFAULT 'INTERNAL',
  ADD COLUMN "publish_status" "MinistryPublishStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "published_at" TIMESTAMP(3);

CREATE INDEX "ministries_church_id_publish_status_visibility_idx"
  ON "ministries"("church_id", "publish_status", "visibility");

ALTER TABLE "grants"
  ADD COLUMN "ministry_id" TEXT;

-- Unique antigo não inclui ministry; recria com escopo.
ALTER TABLE "grants" DROP CONSTRAINT IF EXISTS "grants_user_id_role_id_organization_id_church_id_key";

ALTER TABLE "grants"
  ADD CONSTRAINT "grants_user_id_role_id_organization_id_church_id_ministry_id_key"
  UNIQUE ("user_id", "role_id", "organization_id", "church_id", "ministry_id");

CREATE INDEX "grants_ministry_id_idx" ON "grants"("ministry_id");

ALTER TABLE "grants"
  ADD CONSTRAINT "grants_ministry_id_fkey"
  FOREIGN KEY ("ministry_id") REFERENCES "ministries"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "portal_events" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "church_id" TEXT NOT NULL,
  "ministry_id" TEXT,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT,
  "image_url" TEXT,
  "starts_at" TIMESTAMP(3) NOT NULL,
  "ends_at" TIMESTAMP(3),
  "location_text" TEXT,
  "status" "PortalEventStatus" NOT NULL DEFAULT 'DRAFT',
  "featured_on_home" BOOLEAN NOT NULL DEFAULT false,
  "published_at" TIMESTAMP(3),
  "cancelled_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "portal_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "portal_events_church_id_slug_key" ON "portal_events"("church_id", "slug");
CREATE INDEX "portal_events_organization_id_church_id_idx" ON "portal_events"("organization_id", "church_id");
CREATE INDEX "portal_events_church_id_status_starts_at_idx" ON "portal_events"("church_id", "status", "starts_at");
CREATE INDEX "portal_events_ministry_id_idx" ON "portal_events"("ministry_id");
CREATE INDEX "portal_events_featured_on_home_status_idx" ON "portal_events"("featured_on_home", "status");

ALTER TABLE "portal_events"
  ADD CONSTRAINT "portal_events_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "portal_events"
  ADD CONSTRAINT "portal_events_church_id_fkey"
  FOREIGN KEY ("church_id") REFERENCES "churches"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "portal_events"
  ADD CONSTRAINT "portal_events_ministry_id_fkey"
  FOREIGN KEY ("ministry_id") REFERENCES "ministries"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
