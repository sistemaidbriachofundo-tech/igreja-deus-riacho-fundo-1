-- RF-025: device token registry for push (FCM mock/noop only — no live FCM)

CREATE TYPE "PushPlatform" AS ENUM ('ANDROID', 'IOS', 'WEB');

CREATE TABLE "push_device_tokens" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "church_id" TEXT NOT NULL,
  "person_id" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "platform" "PushPlatform" NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'FCM',
  "device_label" TEXT,
  "app_id" TEXT,
  "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "push_device_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "push_device_tokens_church_id_token_key"
  ON "push_device_tokens"("church_id", "token");
CREATE INDEX "push_device_tokens_person_id_church_id_revoked_at_idx"
  ON "push_device_tokens"("person_id", "church_id", "revoked_at");
CREATE INDEX "push_device_tokens_organization_id_church_id_idx"
  ON "push_device_tokens"("organization_id", "church_id");

ALTER TABLE "push_device_tokens"
  ADD CONSTRAINT "push_device_tokens_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "push_device_tokens"
  ADD CONSTRAINT "push_device_tokens_church_id_fkey"
  FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "push_device_tokens"
  ADD CONSTRAINT "push_device_tokens_person_id_fkey"
  FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
