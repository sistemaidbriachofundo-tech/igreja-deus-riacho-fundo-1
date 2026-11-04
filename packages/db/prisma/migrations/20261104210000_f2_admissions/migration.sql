-- F2 M1: protocolo de admissão e status PENDING_ADMISSION.
-- Enum existente é recriado (ADD VALUE não roda dentro da transação do Migrate).

CREATE TYPE "AdmissionStatus" AS ENUM (
  'DRAFT',
  'AWAITING_DOCUMENTS',
  'AWAITING_SECRETARIA',
  'AWAITING_PASTOR',
  'APPROVED',
  'REJECTED',
  'CANCELLED'
);

CREATE TYPE "AdmissionModality" AS ENUM (
  'BATISMO',
  'TRANSFERENCIA',
  'RECONCILIACAO',
  'OUTRO'
);

CREATE TYPE "MembershipStatus_new" AS ENUM (
  'PENDING_ADMISSION',
  'ACTIVE',
  'INACTIVE',
  'TRANSFERRED'
);

ALTER TABLE "church_memberships" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "church_memberships"
  ALTER COLUMN "status" TYPE "MembershipStatus_new"
  USING ("status"::text::"MembershipStatus_new");
ALTER TYPE "MembershipStatus" RENAME TO "MembershipStatus_old";
ALTER TYPE "MembershipStatus_new" RENAME TO "MembershipStatus";
DROP TYPE "MembershipStatus_old";
ALTER TABLE "church_memberships" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';

CREATE TABLE "admissions" (
    "id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "membership_id" TEXT,
    "church_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "status" "AdmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "modality" "AdmissionModality",
    "notes" TEXT,
    "rejection_reason" TEXT,
    "modality_recorded_at" TIMESTAMP(3),
    "documents_completed_at" TIMESTAMP(3),
    "documents_completed_by_user_id" TEXT,
    "secretaria_decided_at" TIMESTAMP(3),
    "secretaria_decided_by_user_id" TEXT,
    "pastor_decided_at" TIMESTAMP(3),
    "pastor_decided_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admissions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "admissions_church_id_status_idx" ON "admissions"("church_id", "status");
CREATE INDEX "admissions_organization_id_church_id_idx" ON "admissions"("organization_id", "church_id");
CREATE INDEX "admissions_person_id_idx" ON "admissions"("person_id");
CREATE INDEX "admissions_membership_id_idx" ON "admissions"("membership_id");

ALTER TABLE "admissions" ADD CONSTRAINT "admissions_person_id_fkey"
  FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_membership_id_fkey"
  FOREIGN KEY ("membership_id") REFERENCES "church_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_church_id_fkey"
  FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_documents_completed_by_user_id_fkey"
  FOREIGN KEY ("documents_completed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_secretaria_decided_by_user_id_fkey"
  FOREIGN KEY ("secretaria_decided_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_pastor_decided_by_user_id_fkey"
  FOREIGN KEY ("pastor_decided_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
