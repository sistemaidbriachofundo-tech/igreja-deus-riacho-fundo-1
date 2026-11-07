-- RF-020/021: modalidades, lotes, inscrição, check-in, pagamento mock + webhook idempotente.
-- Sem gateway live; sem hospedagem/alimentação/transporte (RF-022 fora desta fatia).

CREATE TYPE "EventModalityKind" AS ENUM ('INDIVIDUAL', 'COUPLE', 'FAMILY', 'CUSTOM');
CREATE TYPE "EventLotStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED');
CREATE TYPE "EventRegistrationStatus" AS ENUM ('PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN', 'CANCELLED');
CREATE TYPE "EventPaymentStatus" AS ENUM ('PENDING', 'CONFIRMED_MOCK', 'FAILED_MOCK', 'CANCELLED');

CREATE TABLE "event_modalities" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "EventModalityKind" NOT NULL DEFAULT 'INDIVIDUAL',
    "capacity" INTEGER,
    "min_party_size" INTEGER NOT NULL DEFAULT 1,
    "max_party_size" INTEGER NOT NULL DEFAULT 1,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_modalities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "event_lots" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "modality_id" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER,
    "price_cents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "opens_at" TIMESTAMP(3),
    "closes_at" TIMESTAMP(3),
    "status" "EventLotStatus" NOT NULL DEFAULT 'DRAFT',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_lots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "event_registrations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "church_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "modality_id" TEXT NOT NULL,
    "lot_id" TEXT,
    "display_name" TEXT NOT NULL,
    "party_size" INTEGER NOT NULL DEFAULT 1,
    "is_minor" BOOLEAN NOT NULL DEFAULT false,
    "guardian_display_name" TEXT,
    "status" "EventRegistrationStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "payment_status" "EventPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "check_in_code" TEXT NOT NULL,
    "checked_in_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_registrations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "event_payment_intents" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "church_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "registration_id" TEXT NOT NULL,
    "lot_id" TEXT,
    "amount_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "status" "EventPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "provider_ref" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_payment_intents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "event_payment_webhook_receipts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "church_id" TEXT NOT NULL,
    "payment_intent_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload_hash" TEXT NOT NULL,
    "result_status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_payment_webhook_receipts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "event_modalities_event_id_code_key" ON "event_modalities"("event_id", "code");
CREATE INDEX "event_modalities_event_id_sort_order_idx" ON "event_modalities"("event_id", "sort_order");

CREATE UNIQUE INDEX "event_lots_event_id_code_key" ON "event_lots"("event_id", "code");
CREATE INDEX "event_lots_event_id_status_sort_order_idx" ON "event_lots"("event_id", "status", "sort_order");
CREATE INDEX "event_lots_modality_id_idx" ON "event_lots"("modality_id");

CREATE UNIQUE INDEX "event_registrations_check_in_code_key" ON "event_registrations"("check_in_code");
CREATE INDEX "event_registrations_organization_id_church_id_idx" ON "event_registrations"("organization_id", "church_id");
CREATE INDEX "event_registrations_event_id_status_idx" ON "event_registrations"("event_id", "status");
CREATE INDEX "event_registrations_modality_id_idx" ON "event_registrations"("modality_id");
CREATE INDEX "event_registrations_lot_id_idx" ON "event_registrations"("lot_id");

CREATE INDEX "event_payment_intents_organization_id_church_id_idx" ON "event_payment_intents"("organization_id", "church_id");
CREATE INDEX "event_payment_intents_registration_id_idx" ON "event_payment_intents"("registration_id");
CREATE INDEX "event_payment_intents_event_id_status_idx" ON "event_payment_intents"("event_id", "status");

CREATE UNIQUE INDEX "event_payment_webhook_receipts_idempotency_key_key" ON "event_payment_webhook_receipts"("idempotency_key");
CREATE INDEX "event_payment_webhook_receipts_payment_intent_id_idx" ON "event_payment_webhook_receipts"("payment_intent_id");

ALTER TABLE "event_modalities" ADD CONSTRAINT "event_modalities_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "portal_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_lots" ADD CONSTRAINT "event_lots_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "portal_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_lots" ADD CONSTRAINT "event_lots_modality_id_fkey" FOREIGN KEY ("modality_id") REFERENCES "event_modalities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "portal_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_modality_id_fkey" FOREIGN KEY ("modality_id") REFERENCES "event_modalities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "event_lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "event_payment_intents" ADD CONSTRAINT "event_payment_intents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "event_payment_intents" ADD CONSTRAINT "event_payment_intents_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "event_payment_intents" ADD CONSTRAINT "event_payment_intents_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "portal_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_payment_intents" ADD CONSTRAINT "event_payment_intents_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "event_registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_payment_intents" ADD CONSTRAINT "event_payment_intents_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "event_lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "event_payment_webhook_receipts" ADD CONSTRAINT "event_payment_webhook_receipts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "event_payment_webhook_receipts" ADD CONSTRAINT "event_payment_webhook_receipts_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "event_payment_webhook_receipts" ADD CONSTRAINT "event_payment_webhook_receipts_payment_intent_id_fkey" FOREIGN KEY ("payment_intent_id") REFERENCES "event_payment_intents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
