-- Alinha a atualização de chaves ao contrato Prisma sem mudar a exclusão em cascata.
BEGIN;

ALTER TABLE "event_participant_tickets"
  DROP CONSTRAINT "event_participant_tickets_registration_id_fkey",
  ADD CONSTRAINT "event_participant_tickets_registration_id_fkey"
  FOREIGN KEY ("registration_id") REFERENCES "event_registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "roster_availability_responses"
  DROP CONSTRAINT "roster_availability_responses_church_id_fkey",
  ADD CONSTRAINT "roster_availability_responses_church_id_fkey"
  FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "roster_availability_responses"
  DROP CONSTRAINT "roster_availability_responses_person_id_fkey",
  ADD CONSTRAINT "roster_availability_responses_person_id_fkey"
  FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "roster_notices"
  DROP CONSTRAINT "roster_notices_church_id_fkey",
  ADD CONSTRAINT "roster_notices_church_id_fkey"
  FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "roster_notices"
  DROP CONSTRAINT "roster_notices_person_id_fkey",
  ADD CONSTRAINT "roster_notices_person_id_fkey"
  FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "roster_push_subscriptions"
  DROP CONSTRAINT "roster_push_subscriptions_church_id_fkey",
  ADD CONSTRAINT "roster_push_subscriptions_church_id_fkey"
  FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "roster_push_subscriptions"
  DROP CONSTRAINT "roster_push_subscriptions_person_id_fkey",
  ADD CONSTRAINT "roster_push_subscriptions_person_id_fkey"
  FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
