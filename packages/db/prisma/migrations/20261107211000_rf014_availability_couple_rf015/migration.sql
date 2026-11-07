-- RF-014: disponibilidade/impedimentos + exceções de casal configuráveis
-- RF-015: sem schema novo (alertas via CommunicationOutbox existente + sourceType/sourceId)

CREATE TYPE "CoupleExceptionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

CREATE TABLE "volunteer_availabilities" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "church_id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "start_minute" INTEGER NOT NULL,
    "end_minute" INTEGER NOT NULL,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "volunteer_availabilities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "volunteer_impediments" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "church_id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "volunteer_impediments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "roster_couple_exceptions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "church_id" TEXT NOT NULL,
    "ministry_id" TEXT,
    "roster_id" TEXT,
    "slot_id" TEXT,
    "person_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "CoupleExceptionStatus" NOT NULL DEFAULT 'PENDING',
    "simulation" BOOLEAN NOT NULL DEFAULT true,
    "requested_by_user_id" TEXT NOT NULL,
    "reviewed_by_user_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roster_couple_exceptions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "volunteer_availabilities_church_id_person_id_active_idx" ON "volunteer_availabilities"("church_id", "person_id", "active");
CREATE INDEX "volunteer_availabilities_person_id_idx" ON "volunteer_availabilities"("person_id");

CREATE INDEX "volunteer_impediments_church_id_person_id_starts_at_ends_at_idx" ON "volunteer_impediments"("church_id", "person_id", "starts_at", "ends_at");
CREATE INDEX "volunteer_impediments_person_id_idx" ON "volunteer_impediments"("person_id");

CREATE INDEX "roster_couple_exceptions_church_id_person_id_status_idx" ON "roster_couple_exceptions"("church_id", "person_id", "status");
CREATE INDEX "roster_couple_exceptions_slot_id_status_idx" ON "roster_couple_exceptions"("slot_id", "status");
CREATE INDEX "roster_couple_exceptions_roster_id_status_idx" ON "roster_couple_exceptions"("roster_id", "status");

ALTER TABLE "volunteer_availabilities" ADD CONSTRAINT "volunteer_availabilities_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "volunteer_availabilities" ADD CONSTRAINT "volunteer_availabilities_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "volunteer_availabilities" ADD CONSTRAINT "volunteer_availabilities_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "volunteer_impediments" ADD CONSTRAINT "volunteer_impediments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "volunteer_impediments" ADD CONSTRAINT "volunteer_impediments_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "volunteer_impediments" ADD CONSTRAINT "volunteer_impediments_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "roster_couple_exceptions" ADD CONSTRAINT "roster_couple_exceptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "roster_couple_exceptions" ADD CONSTRAINT "roster_couple_exceptions_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "roster_couple_exceptions" ADD CONSTRAINT "roster_couple_exceptions_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
