-- Ordem de culto e checklist documental configurável. Aditiva: não apaga protocolo, anexo nem lançamento.

DO $$ BEGIN
  CREATE TYPE "ServiceOrderStatus" AS ENUM ('DRAFT', 'APPROVED', 'PUBLISHED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "service_orders" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "church_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "service_at" TIMESTAMP(3) NOT NULL,
  "notes" TEXT,
  "status" "ServiceOrderStatus" NOT NULL DEFAULT 'DRAFT',
  "created_by_user_id" TEXT NOT NULL,
  "approved_by_user_id" TEXT,
  "approved_at" TIMESTAMP(3),
  "published_by_user_id" TEXT,
  "published_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "service_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "service_order_items" (
  "id" TEXT NOT NULL,
  "order_id" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "minutes" INTEGER,
  "responsible" TEXT,
  CONSTRAINT "service_order_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "admission_document_requirements" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "church_id" TEXT NOT NULL,
  "modality" "AdmissionModality" NOT NULL,
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "required" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "admission_document_requirements_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "admission_documents" ADD COLUMN IF NOT EXISTS "requirement_id" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "service_orders_church_id_service_at_key"
  ON "service_orders"("church_id", "service_at");
CREATE INDEX IF NOT EXISTS "service_orders_organization_id_church_id_service_at_idx"
  ON "service_orders"("organization_id", "church_id", "service_at");
CREATE INDEX IF NOT EXISTS "service_order_items_order_id_position_idx"
  ON "service_order_items"("order_id", "position");
CREATE UNIQUE INDEX IF NOT EXISTS "admission_document_requirements_church_id_modality_code_key"
  ON "admission_document_requirements"("church_id", "modality", "code");
CREATE INDEX IF NOT EXISTS "admission_document_requirements_church_id_modality_active_idx"
  ON "admission_document_requirements"("church_id", "modality", "active");
CREATE INDEX IF NOT EXISTS "admission_documents_requirement_id_idx"
  ON "admission_documents"("requirement_id");

DO $$ BEGIN
  ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_church_id_fkey"
    FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_approved_by_user_id_fkey"
    FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_published_by_user_id_fkey"
    FOREIGN KEY ("published_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "service_order_items" ADD CONSTRAINT "service_order_items_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "service_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "admission_document_requirements" ADD CONSTRAINT "admission_document_requirements_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "admission_document_requirements" ADD CONSTRAINT "admission_document_requirements_church_id_fkey"
    FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "admission_documents" ADD CONSTRAINT "admission_documents_requirement_id_fkey"
    FOREIGN KEY ("requirement_id") REFERENCES "admission_document_requirements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
