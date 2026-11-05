-- Documentos de admissão (metadados). Bytes ficam fora do Postgres (STORAGE_ROOT).

CREATE TABLE "admission_documents" (
  "id" TEXT NOT NULL,
  "admission_id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "church_id" TEXT NOT NULL,
  "uploaded_by_user_id" TEXT NOT NULL,
  "display_name" TEXT NOT NULL,
  "content_type" TEXT NOT NULL,
  "byte_size" INTEGER NOT NULL,
  "storage_key" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admission_documents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "admission_documents_storage_key_key" ON "admission_documents"("storage_key");
CREATE INDEX "admission_documents_admission_id_idx" ON "admission_documents"("admission_id");
CREATE INDEX "admission_documents_organization_id_church_id_idx" ON "admission_documents"("organization_id", "church_id");

ALTER TABLE "admission_documents"
  ADD CONSTRAINT "admission_documents_admission_id_fkey"
  FOREIGN KEY ("admission_id") REFERENCES "admission_protocols"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
