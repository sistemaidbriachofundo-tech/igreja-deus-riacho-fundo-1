-- Central da ordem de culto. Aditiva: não apaga ordem, item, escala nem lançamento.

ALTER TABLE "service_orders" ADD COLUMN IF NOT EXISTS "revision" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "service_orders" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'REGULAR';

ALTER TABLE "service_order_items" ADD COLUMN IF NOT EXISTS "role_key" TEXT;
ALTER TABLE "service_order_items" ADD COLUMN IF NOT EXISTS "responsible_person_id" TEXT;
ALTER TABLE "service_order_items" ADD COLUMN IF NOT EXISTS "equipment" TEXT;
ALTER TABLE "service_order_items" ADD COLUMN IF NOT EXISTS "item_notes" TEXT;
ALTER TABLE "service_order_items" ADD COLUMN IF NOT EXISTS "alert" TEXT;

CREATE INDEX IF NOT EXISTS "service_order_items_responsible_person_id_idx"
  ON "service_order_items"("responsible_person_id");

DO $$ BEGIN
  ALTER TABLE "service_order_items" ADD CONSTRAINT "service_order_items_responsible_person_id_fkey"
    FOREIGN KEY ("responsible_person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "service_order_policies" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "church_id" TEXT NOT NULL,
  "config" JSONB NOT NULL,
  "updated_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "service_order_policies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "service_order_policies_church_id_key"
  ON "service_order_policies"("church_id");

DO $$ BEGIN
  ALTER TABLE "service_order_policies" ADD CONSTRAINT "service_order_policies_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "service_order_policies" ADD CONSTRAINT "service_order_policies_church_id_fkey"
    FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "service_order_policies" ADD CONSTRAINT "service_order_policies_updated_by_user_id_fkey"
    FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "service_order_exceptions" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "church_id" TEXT NOT NULL,
  "service_at" TIMESTAMP(3) NOT NULL,
  "kind" TEXT NOT NULL,
  "title" TEXT,
  "note" TEXT NOT NULL,
  "created_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_order_exceptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "service_order_exceptions_church_id_service_at_kind_key"
  ON "service_order_exceptions"("church_id", "service_at", "kind");
CREATE INDEX IF NOT EXISTS "service_order_exceptions_church_id_service_at_idx"
  ON "service_order_exceptions"("church_id", "service_at");

DO $$ BEGIN
  ALTER TABLE "service_order_exceptions" ADD CONSTRAINT "service_order_exceptions_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "service_order_exceptions" ADD CONSTRAINT "service_order_exceptions_church_id_fkey"
    FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "service_order_exceptions" ADD CONSTRAINT "service_order_exceptions_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "service_order_revisions" (
  "id" TEXT NOT NULL,
  "order_id" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "snapshot" JSONB NOT NULL,
  "created_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_order_revisions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "service_order_revisions_order_id_revision_key"
  ON "service_order_revisions"("order_id", "revision");

DO $$ BEGIN
  ALTER TABLE "service_order_revisions" ADD CONSTRAINT "service_order_revisions_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "service_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "service_order_revisions" ADD CONSTRAINT "service_order_revisions_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
