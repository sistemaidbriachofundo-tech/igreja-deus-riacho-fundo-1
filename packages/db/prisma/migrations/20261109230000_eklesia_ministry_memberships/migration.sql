-- EKLESIA / HML: formal ministry memberships (independent from volunteer interest).
-- Additive, tenant-scoped. No production data/backfill; test first on isolated Neon branch.
CREATE TABLE "ministry_memberships" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "church_id" TEXT NOT NULL,
  "ministry_id" TEXT NOT NULL,
  "person_id" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ATIVO',
  "source" TEXT NOT NULL DEFAULT 'DIRETO',
  "volunteer_interest_id" TEXT,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ended_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ministry_memberships_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ministry_memberships_role_check" CHECK ("role" IN ('LIDER','COORDENADOR','INTEGRANTE','APOIO')),
  CONSTRAINT "ministry_memberships_status_check" CHECK ("status" IN ('ATIVO','CONVIDADO','PAUSADO','ENCERRADO')),
  CONSTRAINT "ministry_memberships_source_check" CHECK ("source" IN ('DIRETO','CONVERSAO_INTERESSE')),
  CONSTRAINT "ministry_memberships_dates_check" CHECK ("ended_at" IS NULL OR "ended_at" >= "started_at")
);

CREATE INDEX "ministry_memberships_organization_id_church_id_ministry_id_idx"
  ON "ministry_memberships"("organization_id", "church_id", "ministry_id");
CREATE INDEX "ministry_memberships_person_id_idx"
  ON "ministry_memberships"("person_id");
CREATE UNIQUE INDEX "ministry_memberships_ministry_id_person_id_key"
  ON "ministry_memberships"("ministry_id", "person_id");

ALTER TABLE "ministry_memberships" ADD CONSTRAINT "ministry_memberships_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ministry_memberships" ADD CONSTRAINT "ministry_memberships_church_id_fkey"
  FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ministry_memberships" ADD CONSTRAINT "ministry_memberships_ministry_id_fkey"
  FOREIGN KEY ("ministry_id") REFERENCES "ministries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ministry_memberships" ADD CONSTRAINT "ministry_memberships_person_id_fkey"
  FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ministry_memberships" ADD CONSTRAINT "ministry_memberships_volunteer_interest_id_fkey"
  FOREIGN KEY ("volunteer_interest_id") REFERENCES "volunteer_interests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
