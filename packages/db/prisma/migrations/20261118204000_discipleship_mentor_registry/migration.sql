CREATE TABLE "discipleship_mentor_registrations" (
  "track_id" TEXT NOT NULL REFERENCES "discipleship_tracks"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "person_id" TEXT NOT NULL REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("track_id", "person_id")
);

CREATE INDEX "discipleship_mentor_registrations_person_id_idx"
ON "discipleship_mentor_registrations"("person_id");

INSERT INTO "discipleship_mentor_registrations" ("track_id", "person_id")
SELECT DISTINCT "track_id", "mentor_person_id"
FROM "discipleship_enrollments"
WHERE "mentor_person_id" IS NOT NULL
ON CONFLICT DO NOTHING;
