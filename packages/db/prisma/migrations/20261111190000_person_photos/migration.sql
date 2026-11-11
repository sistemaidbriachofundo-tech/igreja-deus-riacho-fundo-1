CREATE TABLE "person_photos" (
  "person_id" TEXT PRIMARY KEY REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "jpeg" BYTEA NOT NULL CHECK (octet_length("jpeg") BETWEEN 3 AND 196608)
);
