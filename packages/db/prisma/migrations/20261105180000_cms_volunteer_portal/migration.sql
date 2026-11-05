-- CMS editorial + Atmosfera volunteer interests (portal D+E)

CREATE TYPE "CmsContentKind" AS ENUM ('HOME_BLOCK', 'PAGE', 'NEWS', 'BANNER', 'MINISTRY_CONTENT');
CREATE TYPE "CmsWorkflowStatus" AS ENUM ('RASCUNHO', 'REVISAO', 'APROVADO', 'PUBLICADO', 'ARQUIVADO');
CREATE TYPE "VolunteerJourneyStage" AS ENUM ('INTERESSE', 'AVALIACAO', 'APROVACAO', 'EQUIPE', 'DISPONIBILIDADE', 'ESCALA');
CREATE TYPE "VolunteerInterestStatus" AS ENUM ('OPEN', 'REJECTED', 'CLOSED');

CREATE TABLE "cms_contents" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "church_id" TEXT NOT NULL,
  "ministry_id" TEXT,
  "kind" "CmsContentKind" NOT NULL,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT,
  "body" TEXT,
  "image_url" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "status" "CmsWorkflowStatus" NOT NULL DEFAULT 'RASCUNHO',
  "published_at" TIMESTAMP(3),
  "created_by_user_id" TEXT,
  "updated_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cms_contents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cms_contents_church_id_slug_key" ON "cms_contents"("church_id", "slug");
CREATE INDEX "cms_contents_organization_id_church_id_idx" ON "cms_contents"("organization_id", "church_id");
CREATE INDEX "cms_contents_church_id_status_kind_idx" ON "cms_contents"("church_id", "status", "kind");
CREATE INDEX "cms_contents_ministry_id_idx" ON "cms_contents"("ministry_id");

ALTER TABLE "cms_contents"
  ADD CONSTRAINT "cms_contents_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cms_contents"
  ADD CONSTRAINT "cms_contents_church_id_fkey"
  FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cms_contents"
  ADD CONSTRAINT "cms_contents_ministry_id_fkey"
  FOREIGN KEY ("ministry_id") REFERENCES "ministries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "cms_content_revisions" (
  "id" TEXT NOT NULL,
  "content_id" TEXT NOT NULL,
  "from_status" "CmsWorkflowStatus" NOT NULL,
  "to_status" "CmsWorkflowStatus" NOT NULL,
  "actor_user_id" TEXT,
  "note" TEXT,
  "snapshot" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cms_content_revisions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cms_content_revisions_content_id_created_at_idx"
  ON "cms_content_revisions"("content_id", "created_at");

ALTER TABLE "cms_content_revisions"
  ADD CONSTRAINT "cms_content_revisions_content_id_fkey"
  FOREIGN KEY ("content_id") REFERENCES "cms_contents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "volunteer_interests" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "church_id" TEXT NOT NULL,
  "ministry_id" TEXT NOT NULL,
  "display_name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT,
  "message" TEXT,
  "person_id" TEXT,
  "stage" "VolunteerJourneyStage" NOT NULL DEFAULT 'INTERESSE',
  "status" "VolunteerInterestStatus" NOT NULL DEFAULT 'OPEN',
  "notes_internal" TEXT,
  "roster_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "volunteer_interests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "volunteer_interests_organization_id_church_id_idx"
  ON "volunteer_interests"("organization_id", "church_id");
CREATE INDEX "volunteer_interests_ministry_id_stage_status_idx"
  ON "volunteer_interests"("ministry_id", "stage", "status");
CREATE INDEX "volunteer_interests_email_idx" ON "volunteer_interests"("email");

ALTER TABLE "volunteer_interests"
  ADD CONSTRAINT "volunteer_interests_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "volunteer_interests"
  ADD CONSTRAINT "volunteer_interests_church_id_fkey"
  FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "volunteer_interests"
  ADD CONSTRAINT "volunteer_interests_ministry_id_fkey"
  FOREIGN KEY ("ministry_id") REFERENCES "ministries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "volunteer_interests"
  ADD CONSTRAINT "volunteer_interests_person_id_fkey"
  FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
