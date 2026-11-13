ALTER TABLE "event_registrations" ADD COLUMN "registrant_person_id" TEXT;
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_registrant_person_id_fkey"
    FOREIGN KEY ("registrant_person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "event_registrations_registrant_person_id_church_id_idx"
    ON "event_registrations"("registrant_person_id", "church_id");

ALTER TABLE "event_payment_intents" ADD COLUMN "pix_copia_e_cola" TEXT;
