ALTER TABLE "bank_import_batches"
  ADD COLUMN "account_id" TEXT,
  ADD COLUMN "file_hash" TEXT;

ALTER TABLE "bank_import_batches"
  ADD CONSTRAINT "bank_import_batches_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "ledger_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "bank_import_batches_account_file_key"
  ON "bank_import_batches"("church_id", "account_id", "file_hash");
