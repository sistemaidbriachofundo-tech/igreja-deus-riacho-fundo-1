-- RF-001: stub de foto privada (sem upload binário nesta fatia)
-- RF-006: metadados de PDF de carta (storage_key já existia)

ALTER TABLE "persons" ADD COLUMN "photo_storage_key" TEXT;

CREATE UNIQUE INDEX "persons_photo_storage_key_key" ON "persons"("photo_storage_key");

CREATE INDEX "persons_organization_id_email_idx" ON "persons"("organization_id", "email");

ALTER TABLE "church_letters" ADD COLUMN "pdf_content_type" TEXT;
ALTER TABLE "church_letters" ADD COLUMN "pdf_byte_size" INTEGER;
ALTER TABLE "church_letters" ADD COLUMN "pdf_generated_at" TIMESTAMP(3);
