CREATE TABLE "event_participant_tickets" (
  "id" TEXT NOT NULL,
  "registration_id" TEXT NOT NULL REFERENCES "event_registrations"("id") ON DELETE CASCADE,
  "position" INTEGER NOT NULL CHECK ("position" > 0),
  "code" TEXT NOT NULL,
  "checked_in_at" TIMESTAMP(3),
  CONSTRAINT "event_participant_tickets_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "event_participant_tickets_code_key" ON "event_participant_tickets" ("code");
CREATE UNIQUE INDEX "event_participant_tickets_registration_id_position_key"
ON "event_participant_tickets" ("registration_id", "position");
