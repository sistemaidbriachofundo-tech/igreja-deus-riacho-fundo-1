-- F5 Canais: templates, consentimento, outbox, delivery events (sem WABA live)

CREATE TYPE "CommChannel" AS ENUM ('WHATSAPP', 'EMAIL', 'PUSH');
CREATE TYPE "OutboxStatus" AS ENUM (
  'PENDING',
  'QUEUED',
  'SENDING',
  'SENT',
  'DELIVERED',
  'FAILED',
  'DEAD',
  'CANCELLED'
);

CREATE TABLE "message_templates" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "church_id" TEXT NOT NULL,
  "channel" "CommChannel" NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "subject" TEXT,
  "body" TEXT NOT NULL,
  "locale" TEXT NOT NULL DEFAULT 'pt-BR',
  "provider_template_name" TEXT,
  "variables" JSONB,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "message_templates_church_id_channel_code_key"
  ON "message_templates"("church_id", "channel", "code");
CREATE INDEX "message_templates_organization_id_church_id_idx"
  ON "message_templates"("organization_id", "church_id");

ALTER TABLE "message_templates"
  ADD CONSTRAINT "message_templates_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "message_templates"
  ADD CONSTRAINT "message_templates_church_id_fkey"
  FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "communication_consents" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "church_id" TEXT NOT NULL,
  "person_id" TEXT NOT NULL,
  "whatsapp_opt_in" BOOLEAN NOT NULL DEFAULT false,
  "email_opt_in" BOOLEAN NOT NULL DEFAULT false,
  "push_opt_in" BOOLEAN NOT NULL DEFAULT false,
  "purposes" JSONB NOT NULL DEFAULT '[]',
  "source" TEXT,
  "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked_at" TIMESTAMP(3),
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "communication_consents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "communication_consents_church_id_person_id_key"
  ON "communication_consents"("church_id", "person_id");
CREATE INDEX "communication_consents_organization_id_church_id_idx"
  ON "communication_consents"("organization_id", "church_id");
CREATE INDEX "communication_consents_person_id_idx"
  ON "communication_consents"("person_id");

ALTER TABLE "communication_consents"
  ADD CONSTRAINT "communication_consents_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "communication_consents"
  ADD CONSTRAINT "communication_consents_church_id_fkey"
  FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "communication_consents"
  ADD CONSTRAINT "communication_consents_person_id_fkey"
  FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "communication_outbox" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "church_id" TEXT NOT NULL,
  "channel" "CommChannel" NOT NULL,
  "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
  "person_id" TEXT,
  "to_address" TEXT NOT NULL,
  "template_id" TEXT,
  "template_code" TEXT,
  "subject" TEXT,
  "body_rendered" TEXT NOT NULL,
  "payload" JSONB,
  "consent_checked_at" TIMESTAMP(3),
  "provider_message_id" TEXT,
  "last_error" TEXT,
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "next_attempt_at" TIMESTAMP(3),
  "scheduled_at" TIMESTAMP(3),
  "sent_at" TIMESTAMP(3),
  "delivered_at" TIMESTAMP(3),
  "source_type" TEXT,
  "source_id" TEXT,
  "created_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "communication_outbox_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "communication_outbox_organization_id_church_id_status_idx"
  ON "communication_outbox"("organization_id", "church_id", "status");
CREATE INDEX "communication_outbox_channel_status_next_attempt_at_idx"
  ON "communication_outbox"("channel", "status", "next_attempt_at");
CREATE INDEX "communication_outbox_person_id_idx"
  ON "communication_outbox"("person_id");
CREATE INDEX "communication_outbox_source_type_source_id_idx"
  ON "communication_outbox"("source_type", "source_id");

ALTER TABLE "communication_outbox"
  ADD CONSTRAINT "communication_outbox_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "communication_outbox"
  ADD CONSTRAINT "communication_outbox_church_id_fkey"
  FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "communication_outbox"
  ADD CONSTRAINT "communication_outbox_person_id_fkey"
  FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "communication_outbox"
  ADD CONSTRAINT "communication_outbox_template_id_fkey"
  FOREIGN KEY ("template_id") REFERENCES "message_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "outbox_delivery_events" (
  "id" TEXT NOT NULL,
  "outbox_id" TEXT NOT NULL,
  "status" "OutboxStatus" NOT NULL,
  "provider_response" JSONB,
  "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "outbox_delivery_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "outbox_delivery_events_outbox_id_created_at_idx"
  ON "outbox_delivery_events"("outbox_id", "created_at");

ALTER TABLE "outbox_delivery_events"
  ADD CONSTRAINT "outbox_delivery_events_outbox_id_fkey"
  FOREIGN KEY ("outbox_id") REFERENCES "communication_outbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;
