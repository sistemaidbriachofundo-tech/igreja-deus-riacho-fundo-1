-- Pacote de DEV: configurações, oração, aniversário, louvor, Mercado Pago e ingresso por participante.
-- Aditiva. Não apaga protocolo, lançamento, inscrição nem valor já gravado.

ALTER TYPE "EventPaymentStatus" ADD VALUE IF NOT EXISTS 'CONFIRMED_GATEWAY';
ALTER TYPE "EventPaymentStatus" ADD VALUE IF NOT EXISTS 'REFUNDED';

DO $$ BEGIN
  CREATE TYPE "EventTicketPolicy" AS ENUM ('REGISTRATION', 'PARTICIPANT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "EventPaymentProvider" AS ENUM ('PIX', 'MERCADO_PAGO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "SystemSettingScopeKind" AS ENUM ('PLATFORM', 'CHURCH', 'MINISTRY', 'MODULE', 'GROUP', 'TRACK');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "SystemSettingLifecycle" AS ENUM ('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'RETIRED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "OperationalScopeKind" AS ENUM ('MINISTRY', 'MODULE', 'GROUP', 'TRACK');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "PrayerRequestStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "VocalClassification" AS ENUM ('SOPRANO', 'CONTRALTO', 'TENOR', 'BASS', 'UNSPECIFIED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "RepertoireStatus" AS ENUM ('DRAFT', 'AUTHORIZED', 'SCHEDULED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "portal_events" ADD COLUMN IF NOT EXISTS "ticket_policy" "EventTicketPolicy" NOT NULL DEFAULT 'REGISTRATION';
ALTER TABLE "portal_events" ADD COLUMN IF NOT EXISTS "created_by_user_id" TEXT;
ALTER TABLE "event_lots" ADD COLUMN IF NOT EXISTS "payment_provider" "EventPaymentProvider" NOT NULL DEFAULT 'PIX';
ALTER TABLE "event_participant_tickets" ADD COLUMN IF NOT EXISTS "participant_name" TEXT;
ALTER TABLE "event_participant_tickets" ADD COLUMN IF NOT EXISTS "participant_email" TEXT;
ALTER TABLE "event_participant_tickets" ADD COLUMN IF NOT EXISTS "scanned_by_user_id" TEXT;
ALTER TABLE "event_payment_intents" ADD COLUMN IF NOT EXISTS "payment_provider" "EventPaymentProvider" NOT NULL DEFAULT 'PIX';
ALTER TABLE "event_payment_intents" ADD COLUMN IF NOT EXISTS "attempt_ref" TEXT;
ALTER TABLE "event_payment_intents" ADD COLUMN IF NOT EXISTS "provider_payment_id" TEXT;
ALTER TABLE "event_payment_intents" ADD COLUMN IF NOT EXISTS "gross_cents" INTEGER;
ALTER TABLE "event_payment_intents" ADD COLUMN IF NOT EXISTS "fee_cents" INTEGER;
ALTER TABLE "event_payment_intents" ADD COLUMN IF NOT EXISTS "net_cents" INTEGER;
ALTER TABLE "event_payment_intents" ADD COLUMN IF NOT EXISTS "due_on" DATE;
ALTER TABLE "event_payment_intents" ADD COLUMN IF NOT EXISTS "refunded_at" TIMESTAMP(3);
ALTER TABLE "church_receiving_accounts" ADD COLUMN IF NOT EXISTS "mercado_pago_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "church_receiving_accounts" ADD COLUMN IF NOT EXISTS "mercado_pago_collector_id" TEXT;
ALTER TABLE "roster_slots" ADD COLUMN IF NOT EXISTS "manual_fill" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS "event_payment_intents_attempt_ref_key" ON "event_payment_intents"("attempt_ref");

CREATE TABLE IF NOT EXISTS "system_setting_catalog" (
  "key" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "value_type" TEXT NOT NULL,
  "scope_kind" "SystemSettingScopeKind" NOT NULL,
  "default_json" JSONB NOT NULL,
  "dev_json" JSONB NOT NULL,
  CONSTRAINT "system_setting_catalog_pkey" PRIMARY KEY ("key")
);

CREATE TABLE IF NOT EXISTS "system_setting_revisions" (
  "id" TEXT NOT NULL,
  "catalog_key" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "church_id" TEXT,
  "scope_kind" "SystemSettingScopeKind" NOT NULL,
  "scope_id" TEXT,
  "lifecycle" "SystemSettingLifecycle" NOT NULL DEFAULT 'DRAFT',
  "value_json" JSONB NOT NULL,
  "effective_from" TIMESTAMP(3),
  "effective_until" TIMESTAMP(3),
  "drafted_by_user_id" TEXT NOT NULL,
  "reviewed_by_user_id" TEXT,
  "published_by_user_id" TEXT,
  "note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "system_setting_revisions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "access_scope_bindings" (
  "id" TEXT NOT NULL,
  "grant_id" TEXT NOT NULL,
  "kind" "OperationalScopeKind" NOT NULL,
  "scope_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "access_scope_bindings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "prayer_requests" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "church_id" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "status" "PrayerRequestStatus" NOT NULL DEFAULT 'OPEN',
  "responsible_user_id" TEXT NOT NULL,
  "substitute_user_id" TEXT,
  "submitted_by_person_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "prayer_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "prayer_bells" (
  "id" TEXT NOT NULL,
  "request_id" TEXT NOT NULL,
  "recipient_user_id" TEXT NOT NULL,
  "read_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "prayer_bells_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "birthday_notices" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "church_id" TEXT NOT NULL,
  "recipient_person_id" TEXT NOT NULL,
  "occasion_date" DATE NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "birthday_notices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "person_vocal_profiles" (
  "person_id" TEXT NOT NULL,
  "church_id" TEXT NOT NULL,
  "classification" "VocalClassification" NOT NULL DEFAULT 'UNSPECIFIED',
  "functions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "person_vocal_profiles_pkey" PRIMARY KEY ("person_id")
);

CREATE TABLE IF NOT EXISTS "worship_repertoires" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "church_id" TEXT NOT NULL,
  "roster_id" TEXT,
  "service_at" TIMESTAMP(3) NOT NULL,
  "status" "RepertoireStatus" NOT NULL DEFAULT 'DRAFT',
  "idempotency_key" TEXT NOT NULL,
  "authorized_by_user_id" TEXT,
  "authorized_at" TIMESTAMP(3),
  "scheduled_at" TIMESTAMP(3),
  "created_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "worship_repertoires_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "worship_repertoire_items" (
  "id" TEXT NOT NULL,
  "repertoire_id" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "musical_key" TEXT NOT NULL,
  "materials" TEXT,
  CONSTRAINT "worship_repertoire_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "worship_repertoire_notices" (
  "id" TEXT NOT NULL,
  "repertoire_id" TEXT NOT NULL,
  "recipient_person_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "worship_repertoire_notices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "person_dossier_files" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "church_id" TEXT NOT NULL,
  "person_id" TEXT NOT NULL,
  "file_name" TEXT NOT NULL,
  "content_type" TEXT NOT NULL,
  "byte_size" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "storage_key" TEXT NOT NULL,
  "uploaded_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "person_dossier_files_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "event_scanner_grants" (
  "id" TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "granted_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_scanner_grants_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "system_setting_revisions_catalog_key_lifecycle_effective_from_idx"
  ON "system_setting_revisions"("catalog_key", "lifecycle", "effective_from");
CREATE INDEX IF NOT EXISTS "system_setting_revisions_organization_id_church_id_idx"
  ON "system_setting_revisions"("organization_id", "church_id");
CREATE UNIQUE INDEX IF NOT EXISTS "access_scope_bindings_grant_id_kind_scope_id_key"
  ON "access_scope_bindings"("grant_id", "kind", "scope_id");
CREATE INDEX IF NOT EXISTS "access_scope_bindings_kind_scope_id_idx" ON "access_scope_bindings"("kind", "scope_id");
CREATE INDEX IF NOT EXISTS "prayer_requests_church_id_status_idx" ON "prayer_requests"("church_id", "status");
CREATE INDEX IF NOT EXISTS "prayer_bells_recipient_user_id_read_at_idx" ON "prayer_bells"("recipient_user_id", "read_at");
CREATE UNIQUE INDEX IF NOT EXISTS "birthday_notices_church_id_recipient_person_id_occasion_date_key"
  ON "birthday_notices"("church_id", "recipient_person_id", "occasion_date");
CREATE INDEX IF NOT EXISTS "person_vocal_profiles_church_id_idx" ON "person_vocal_profiles"("church_id");
CREATE UNIQUE INDEX IF NOT EXISTS "worship_repertoires_idempotency_key_key" ON "worship_repertoires"("idempotency_key");
CREATE INDEX IF NOT EXISTS "worship_repertoires_church_id_service_at_idx" ON "worship_repertoires"("church_id", "service_at");
CREATE UNIQUE INDEX IF NOT EXISTS "worship_repertoire_items_repertoire_id_sort_order_key"
  ON "worship_repertoire_items"("repertoire_id", "sort_order");
CREATE UNIQUE INDEX IF NOT EXISTS "worship_repertoire_notices_repertoire_id_recipient_person_id_key"
  ON "worship_repertoire_notices"("repertoire_id", "recipient_person_id");
CREATE UNIQUE INDEX IF NOT EXISTS "person_dossier_files_storage_key_key" ON "person_dossier_files"("storage_key");
CREATE INDEX IF NOT EXISTS "person_dossier_files_person_id_church_id_idx" ON "person_dossier_files"("person_id", "church_id");
CREATE UNIQUE INDEX IF NOT EXISTS "event_scanner_grants_event_id_user_id_key" ON "event_scanner_grants"("event_id", "user_id");

DO $$ BEGIN
  ALTER TABLE "system_setting_revisions" ADD CONSTRAINT "system_setting_revisions_catalog_key_fkey"
    FOREIGN KEY ("catalog_key") REFERENCES "system_setting_catalog"("key") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "prayer_bells" ADD CONSTRAINT "prayer_bells_request_id_fkey"
    FOREIGN KEY ("request_id") REFERENCES "prayer_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "worship_repertoire_items" ADD CONSTRAINT "worship_repertoire_items_repertoire_id_fkey"
    FOREIGN KEY ("repertoire_id") REFERENCES "worship_repertoires"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "worship_repertoire_notices" ADD CONSTRAINT "worship_repertoire_notices_repertoire_id_fkey"
    FOREIGN KEY ("repertoire_id") REFERENCES "worship_repertoires"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Valores vigentes de DEV. ON CONFLICT não altera dev_json já gravado.
INSERT INTO "system_setting_catalog" ("key", "title", "description", "value_type", "scope_kind", "default_json", "dev_json")
VALUES
  ('auth.password_reset.ttl_hours', 'Validade da recuperação de senha', 'Horas do link de uso único.', 'number', 'CHURCH', '1', '1'),
  ('notices.birthday.hour_brasilia', 'Horário dos aniversariantes', 'Hora de Brasília para o aviso diário.', 'time', 'CHURCH', '"08:00"', '"08:00"'),
  ('notices.birthday.timezone', 'Fuso dos aniversariantes', 'Calendário civil dos avisos.', 'string', 'CHURCH', '"America/Sao_Paulo"', '"America/Sao_Paulo"'),
  ('events.registration.session_required', 'Inscrição com sessão', 'Toda inscrição, inclusive gratuita, exige sessão.', 'boolean', 'CHURCH', 'true', 'true'),
  ('finance.mercado_pago.enabled', 'Mercado Pago', 'Permanece desligado até a conta de teste ser autorizada.', 'boolean', 'CHURCH', 'false', 'false'),
  ('finance.brb.mode', 'BRB', 'Sem API live. Somente mock.', 'string', 'CHURCH', '"mock"', '"mock"'),
  ('finance.sicoob.mode', 'Sicoob', 'Sem API live. Somente mock.', 'string', 'CHURCH', '"mock"', '"mock"'),
  ('rosters.louvor.week_block', 'Bloqueio semanal de Louvor', 'Uma escala de Louvor ocupa a semana de segunda a domingo.', 'boolean', 'MINISTRY', 'true', 'true'),
  ('rosters.ceia.manual', 'Santa Ceia manual', 'A Ceia não entra no preenchimento automático.', 'boolean', 'MODULE', 'true', 'true'),
  ('credentials.color_rule', 'Regra da carteira colorida', 'A cor acompanha situação e cargo eclesiástico.', 'string', 'CHURCH', '"ecclesiastical"', '"ecclesiastical"')
ON CONFLICT ("key") DO NOTHING;
