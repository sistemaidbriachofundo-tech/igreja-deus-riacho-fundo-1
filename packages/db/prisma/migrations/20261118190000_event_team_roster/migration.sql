ALTER TABLE "rosters" ADD COLUMN "portal_event_id" TEXT;

CREATE UNIQUE INDEX "rosters_portal_event_id_key" ON "rosters"("portal_event_id");

ALTER TABLE "rosters"
  ADD CONSTRAINT "rosters_portal_event_id_fkey"
  FOREIGN KEY ("portal_event_id") REFERENCES "portal_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
