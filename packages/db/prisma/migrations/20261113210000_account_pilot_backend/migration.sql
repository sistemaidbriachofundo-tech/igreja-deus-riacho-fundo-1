-- Piloto administrativo DEV: telefone da própria conta, Pix da conta da igreja e estado de e-mail.
-- Não reescreve migrações já aplicadas. A reversão operacional está em docs/piloto/backend-conta-eventos.md.

ALTER TABLE "persons" ADD COLUMN "phone" TEXT;

ALTER TYPE "EventPaymentStatus" ADD VALUE 'CONFIRMED_PIX';

ALTER TABLE "event_registrations" ADD COLUMN "notification_email" TEXT;

CREATE TABLE "church_receiving_accounts" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "church_id" TEXT NOT NULL,
  "ledger_account_id" TEXT NOT NULL,
  "display_name" TEXT NOT NULL,
  "pix_key" TEXT NOT NULL,
  "merchant_city" TEXT NOT NULL DEFAULT 'Brasilia',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "church_receiving_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "church_receiving_accounts_ledger_account_id_key"
  ON "church_receiving_accounts"("ledger_account_id");
CREATE INDEX "church_receiving_accounts_organization_id_church_id_active_idx"
  ON "church_receiving_accounts"("organization_id", "church_id", "active");

ALTER TABLE "church_receiving_accounts"
  ADD CONSTRAINT "church_receiving_accounts_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "church_receiving_accounts"
  ADD CONSTRAINT "church_receiving_accounts_church_id_fkey"
  FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "church_receiving_accounts"
  ADD CONSTRAINT "church_receiving_accounts_ledger_account_id_fkey"
  FOREIGN KEY ("ledger_account_id") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "event_lots" ADD COLUMN "receiving_account_id" TEXT;
ALTER TABLE "event_lots"
  ADD CONSTRAINT "event_lots_receiving_account_id_fkey"
  FOREIGN KEY ("receiving_account_id") REFERENCES "church_receiving_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "event_payment_intents" ADD COLUMN "receiving_account_id" TEXT;
ALTER TABLE "event_payment_intents" ADD COLUMN "ledger_entry_id" TEXT;
ALTER TABLE "event_payment_intents" ADD COLUMN "pix_txid" TEXT;
CREATE UNIQUE INDEX "event_payment_intents_ledger_entry_id_key"
  ON "event_payment_intents"("ledger_entry_id");
ALTER TABLE "event_payment_intents"
  ADD CONSTRAINT "event_payment_intents_receiving_account_id_fkey"
  FOREIGN KEY ("receiving_account_id") REFERENCES "church_receiving_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "event_payment_intents"
  ADD CONSTRAINT "event_payment_intents_ledger_entry_id_fkey"
  FOREIGN KEY ("ledger_entry_id") REFERENCES "ledger_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "mail_deliveries" (
  "id" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "to_address" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "provider_message_id" TEXT,
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "last_error" TEXT,
  "sent_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "mail_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mail_deliveries_idempotency_key_key" ON "mail_deliveries"("idempotency_key");
