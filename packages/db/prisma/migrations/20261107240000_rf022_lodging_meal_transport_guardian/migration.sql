-- RF-022: hospedagem / alimentação / transporte + autorização formal de menor em eventos.
-- Extende inscrição RF-020/021 (#75). Sem gateway live; sem PII real.

CREATE TYPE "EventLodgingKind" AS ENUM ('NONE', 'SHARED', 'COUPLE', 'FAMILY', 'CUSTOM');
CREATE TYPE "EventMealKind" AS ENUM ('NONE', 'BREAKFAST', 'LUNCH', 'DINNER', 'FULL_BOARD', 'CUSTOM');
CREATE TYPE "EventTransportKind" AS ENUM ('NONE', 'OWN', 'EVENT_BUS', 'CARPOOL', 'CUSTOM');
CREATE TYPE "EventGuardianAuthStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'AUTHORIZED', 'REVOKED');

CREATE TABLE "event_lodging_options" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "EventLodgingKind" NOT NULL DEFAULT 'CUSTOM',
    "capacity" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_lodging_options_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "event_meal_options" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "EventMealKind" NOT NULL DEFAULT 'CUSTOM',
    "capacity" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_meal_options_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "event_transport_options" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "EventTransportKind" NOT NULL DEFAULT 'CUSTOM',
    "capacity" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_transport_options_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "event_registrations"
    ADD COLUMN "lodging_option_id" TEXT,
    ADD COLUMN "meal_option_id" TEXT,
    ADD COLUMN "transport_option_id" TEXT,
    ADD COLUMN "guardian_auth_status" "EventGuardianAuthStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    ADD COLUMN "guardian_authorized_at" TIMESTAMP(3);

CREATE TABLE "event_guardian_authorizations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "church_id" TEXT NOT NULL,
    "registration_id" TEXT NOT NULL,
    "guardian_display_name" TEXT NOT NULL,
    "status" "EventGuardianAuthStatus" NOT NULL DEFAULT 'PENDING',
    "acknowledgment_text" TEXT NOT NULL,
    "authorized_at" TIMESTAMP(3),
    "authorized_by_user_id" TEXT,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_guardian_authorizations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "event_lodging_options_event_id_code_key" ON "event_lodging_options"("event_id", "code");
CREATE INDEX "event_lodging_options_event_id_sort_order_idx" ON "event_lodging_options"("event_id", "sort_order");

CREATE UNIQUE INDEX "event_meal_options_event_id_code_key" ON "event_meal_options"("event_id", "code");
CREATE INDEX "event_meal_options_event_id_sort_order_idx" ON "event_meal_options"("event_id", "sort_order");

CREATE UNIQUE INDEX "event_transport_options_event_id_code_key" ON "event_transport_options"("event_id", "code");
CREATE INDEX "event_transport_options_event_id_sort_order_idx" ON "event_transport_options"("event_id", "sort_order");

CREATE INDEX "event_registrations_lodging_option_id_idx" ON "event_registrations"("lodging_option_id");
CREATE INDEX "event_registrations_meal_option_id_idx" ON "event_registrations"("meal_option_id");
CREATE INDEX "event_registrations_transport_option_id_idx" ON "event_registrations"("transport_option_id");

CREATE UNIQUE INDEX "event_guardian_authorizations_registration_id_key" ON "event_guardian_authorizations"("registration_id");
CREATE INDEX "event_guardian_authorizations_organization_id_church_id_idx" ON "event_guardian_authorizations"("organization_id", "church_id");
CREATE INDEX "event_guardian_authorizations_status_idx" ON "event_guardian_authorizations"("status");

ALTER TABLE "event_lodging_options" ADD CONSTRAINT "event_lodging_options_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "portal_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_meal_options" ADD CONSTRAINT "event_meal_options_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "portal_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_transport_options" ADD CONSTRAINT "event_transport_options_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "portal_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_lodging_option_id_fkey" FOREIGN KEY ("lodging_option_id") REFERENCES "event_lodging_options"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_meal_option_id_fkey" FOREIGN KEY ("meal_option_id") REFERENCES "event_meal_options"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_transport_option_id_fkey" FOREIGN KEY ("transport_option_id") REFERENCES "event_transport_options"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "event_guardian_authorizations" ADD CONSTRAINT "event_guardian_authorizations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "event_guardian_authorizations" ADD CONSTRAINT "event_guardian_authorizations_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "event_guardian_authorizations" ADD CONSTRAINT "event_guardian_authorizations_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "event_registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
