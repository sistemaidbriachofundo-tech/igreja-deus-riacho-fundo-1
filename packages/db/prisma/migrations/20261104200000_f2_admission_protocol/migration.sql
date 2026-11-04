-- F2 M1: admissão formal, person kind/menor, PENDING_ADMISSION

CREATE TYPE "PersonKind" AS ENUM ('VISITOR', 'MEMBER');
CREATE TYPE "AdmissionStatus" AS ENUM (
  'DRAFT',
  'AWAITING_DOCUMENTS',
  'AWAITING_SECRETARIA',
  'AWAITING_PASTOR',
  'APPROVED',
  'REJECTED',
  'CANCELLED'
);
CREATE TYPE "AdmissionModality" AS ENUM ('BATISMO', 'TRANSFERENCIA', 'RECONCILIACAO', 'OUTRO');
CREATE TYPE "AdmissionStep" AS ENUM ('modality', 'documents', 'secretaria', 'pastor');

ALTER TYPE "MembershipStatus" ADD VALUE IF NOT EXISTS 'PENDING_ADMISSION';

ALTER TABLE "persons"
  ADD COLUMN "kind" "PersonKind" NOT NULL DEFAULT 'VISITOR',
  ADD COLUMN "is_minor" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "legal_guardian_person_id" TEXT;

CREATE INDEX "persons_organization_id_display_name_idx" ON "persons"("organization_id", "display_name");
CREATE INDEX "persons_legal_guardian_person_id_idx" ON "persons"("legal_guardian_person_id");

ALTER TABLE "persons"
  ADD CONSTRAINT "persons_legal_guardian_person_id_fkey"
  FOREIGN KEY ("legal_guardian_person_id") REFERENCES "persons"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "admission_protocols" (
  "id" TEXT NOT NULL,
  "person_id" TEXT NOT NULL,
  "membership_id" TEXT,
  "organization_id" TEXT NOT NULL,
  "church_id" TEXT NOT NULL,
  "status" "AdmissionStatus" NOT NULL DEFAULT 'DRAFT',
  "modality" "AdmissionModality",
  "current_step" "AdmissionStep" NOT NULL DEFAULT 'modality',
  "modality_recorded" BOOLEAN NOT NULL DEFAULT false,
  "documents_complete" BOOLEAN NOT NULL DEFAULT false,
  "secretaria_approved" BOOLEAN NOT NULL DEFAULT false,
  "pastor_approved" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "rejection_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "admission_protocols_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "admission_protocols_church_id_status_idx" ON "admission_protocols"("church_id", "status");
CREATE INDEX "admission_protocols_person_id_idx" ON "admission_protocols"("person_id");
CREATE INDEX "admission_protocols_organization_id_church_id_idx" ON "admission_protocols"("organization_id", "church_id");

ALTER TABLE "admission_protocols"
  ADD CONSTRAINT "admission_protocols_person_id_fkey"
  FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "admission_protocols"
  ADD CONSTRAINT "admission_protocols_membership_id_fkey"
  FOREIGN KEY ("membership_id") REFERENCES "church_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "admission_protocols"
  ADD CONSTRAINT "admission_protocols_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "admission_protocols"
  ADD CONSTRAINT "admission_protocols_church_id_fkey"
  FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
