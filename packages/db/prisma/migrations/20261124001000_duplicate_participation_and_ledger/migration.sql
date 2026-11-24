-- Aditiva. Não apaga inscrições, lançamentos nem duplicatas já gravadas.
CREATE TABLE IF NOT EXISTS "event_participation_keys" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "church_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "registration_id" TEXT NOT NULL,
    "identity_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "event_participation_keys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "event_participation_keys_event_id_identity_key_key"
    ON "event_participation_keys"("event_id", "identity_key");
CREATE INDEX IF NOT EXISTS "event_participation_keys_registration_id_idx"
    ON "event_participation_keys"("registration_id");
CREATE INDEX IF NOT EXISTS "event_participation_keys_organization_id_church_id_idx"
    ON "event_participation_keys"("organization_id", "church_id");

DO $$ BEGIN
    ALTER TABLE "event_participation_keys"
        ADD CONSTRAINT "event_participation_keys_registration_id_fkey"
        FOREIGN KEY ("registration_id") REFERENCES "event_registrations"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- A inscrição mais antiga fica com a chave. As demais linhas históricas continuam na tabela.
INSERT INTO "event_participation_keys" (
    "id", "organization_id", "church_id", "event_id", "registration_id", "identity_key"
)
SELECT
    'epk_' || md5(r."event_id" || ':person:' || r."registrant_person_id"),
    r."organization_id", r."church_id", r."event_id", r."id",
    'person:' || r."registrant_person_id"
FROM (
    SELECT DISTINCT ON ("event_id", "registrant_person_id") *
    FROM "event_registrations"
    WHERE "registrant_person_id" IS NOT NULL
      AND "is_minor" = false
      AND "status" IN ('PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN')
      AND "payment_status" NOT IN ('REFUNDED', 'CANCELLED')
    ORDER BY "event_id", "registrant_person_id", "created_at" ASC, "id" ASC
) r
ON CONFLICT ("event_id", "identity_key") DO NOTHING;

INSERT INTO "event_participation_keys" (
    "id", "organization_id", "church_id", "event_id", "registration_id", "identity_key"
)
SELECT
    'epk_' || md5(r."event_id" || ':email:' || lower(btrim(r."notification_email"))),
    r."organization_id", r."church_id", r."event_id", r."id",
    'email:' || lower(btrim(r."notification_email"))
FROM (
    SELECT DISTINCT ON ("event_id", lower(btrim("notification_email"))) *
    FROM "event_registrations"
    WHERE "notification_email" IS NOT NULL
      AND btrim("notification_email") <> ''
      AND "is_minor" = false
      AND "party_size" <= 1
      AND "status" IN ('PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN')
      AND "payment_status" NOT IN ('REFUNDED', 'CANCELLED')
    ORDER BY "event_id", lower(btrim("notification_email")), "created_at" ASC, "id" ASC
) r
ON CONFLICT ("event_id", "identity_key") DO NOTHING;

INSERT INTO "event_participation_keys" (
    "id", "organization_id", "church_id", "event_id", "registration_id", "identity_key"
)
SELECT
    'epk_' || md5(src."event_id" || ':email:' || src."email"),
    src."organization_id", src."church_id", src."event_id", src."id",
    'email:' || src."email"
FROM (
    SELECT DISTINCT ON (r."event_id", lower(btrim(elem->>'email')))
        r."id", r."organization_id", r."church_id", r."event_id",
        lower(btrim(elem->>'email')) AS "email"
    FROM "event_registrations" r
    CROSS JOIN LATERAL jsonb_array_elements(
        CASE
            WHEN jsonb_typeof(r."participant_roster") = 'array' THEN r."participant_roster"
            ELSE '[]'::jsonb
        END
    ) elem
    WHERE r."status" IN ('PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN')
      AND r."payment_status" NOT IN ('REFUNDED', 'CANCELLED')
      AND COALESCE(btrim(elem->>'email'), '') <> ''
    ORDER BY r."event_id", lower(btrim(elem->>'email')), r."created_at" ASC, r."id" ASC
) src
ON CONFLICT ("event_id", "identity_key") DO NOTHING;

ALTER TABLE "ledger_entries" ADD COLUMN IF NOT EXISTS "external_document_id" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "ledger_entries_church_document_key"
    ON "ledger_entries"("church_id", "external_document_id");
