-- Ordem de Culto: critérios editáveis por congregação e referência segura à pessoa
CREATE TABLE IF NOT EXISTS "service_order_policies" (
  "church_id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "rules" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "updated_by_user_id" TEXT NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_order_policies_pkey" PRIMARY KEY ("church_id")
);
CREATE INDEX IF NOT EXISTS "service_order_policies_organization_id_idx" ON "service_order_policies" ("organization_id");
ALTER TABLE "service_order_policies"
  ADD CONSTRAINT "service_order_policies_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_order_items"
  ADD COLUMN "responsible_person_id" TEXT,
  ADD COLUMN "microphone" TEXT,
  ADD COLUMN "equipment" TEXT,
  ADD COLUMN "notes" TEXT;
CREATE INDEX "service_order_items_responsible_person_id_idx" ON "service_order_items"("responsible_person_id");
ALTER TABLE "service_order_items"
  ADD CONSTRAINT "service_order_items_responsible_person_id_fkey" FOREIGN KEY ("responsible_person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
