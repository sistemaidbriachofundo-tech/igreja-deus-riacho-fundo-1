-- F4 finance nucleus: chart of accounts, ledger, import stubs, reconciliation

CREATE TYPE "LedgerAccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');
CREATE TYPE "LedgerEntryStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'REVERSED');
CREATE TYPE "LedgerLineSide" AS ENUM ('DEBIT', 'CREDIT');
CREATE TYPE "BankImportFormat" AS ENUM ('CSV', 'OFX', 'PDF_META');
CREATE TYPE "BankImportStatus" AS ENUM ('RECEIVED', 'PARSED_STUB', 'FAILED');
CREATE TYPE "BankLineMatchStatus" AS ENUM ('UNMATCHED', 'SUGGESTED', 'MATCHED', 'IGNORED');
CREATE TYPE "ReconciliationStatus" AS ENUM ('OPEN', 'PENDING_APPROVAL', 'APPROVED', 'CLOSED');

CREATE TABLE "ledger_accounts" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "church_id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "LedgerAccountType" NOT NULL,
  "parent_id" TEXT,
  "cost_center" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ledger_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ledger_accounts_church_id_code_key" ON "ledger_accounts"("church_id", "code");
CREATE INDEX "ledger_accounts_organization_id_church_id_idx" ON "ledger_accounts"("organization_id", "church_id");
CREATE INDEX "ledger_accounts_church_id_type_active_idx" ON "ledger_accounts"("church_id", "type", "active");

ALTER TABLE "ledger_accounts"
  ADD CONSTRAINT "ledger_accounts_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ledger_accounts"
  ADD CONSTRAINT "ledger_accounts_church_id_fkey"
  FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ledger_accounts"
  ADD CONSTRAINT "ledger_accounts_parent_id_fkey"
  FOREIGN KEY ("parent_id") REFERENCES "ledger_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "bank_import_batches" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "church_id" TEXT NOT NULL,
  "format" "BankImportFormat" NOT NULL,
  "status" "BankImportStatus" NOT NULL DEFAULT 'RECEIVED',
  "filename" TEXT NOT NULL,
  "stub_note" TEXT,
  "line_count" INTEGER NOT NULL DEFAULT 0,
  "created_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "bank_import_batches_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "bank_import_batches_organization_id_church_id_status_idx"
  ON "bank_import_batches"("organization_id", "church_id", "status");

ALTER TABLE "bank_import_batches"
  ADD CONSTRAINT "bank_import_batches_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bank_import_batches"
  ADD CONSTRAINT "bank_import_batches_church_id_fkey"
  FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bank_import_batches"
  ADD CONSTRAINT "bank_import_batches_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "reconciliations" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "church_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "period_start" DATE NOT NULL,
  "period_end" DATE NOT NULL,
  "status" "ReconciliationStatus" NOT NULL DEFAULT 'OPEN',
  "notes" TEXT,
  "created_by_user_id" TEXT NOT NULL,
  "first_approved_by_user_id" TEXT,
  "first_approved_at" TIMESTAMP(3),
  "second_approved_by_user_id" TEXT,
  "second_approved_at" TIMESTAMP(3),
  "closed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "reconciliations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "reconciliations_organization_id_church_id_status_idx"
  ON "reconciliations"("organization_id", "church_id", "status");
CREATE INDEX "reconciliations_church_id_period_start_period_end_idx"
  ON "reconciliations"("church_id", "period_start", "period_end");

ALTER TABLE "reconciliations"
  ADD CONSTRAINT "reconciliations_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reconciliations"
  ADD CONSTRAINT "reconciliations_church_id_fkey"
  FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reconciliations"
  ADD CONSTRAINT "reconciliations_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reconciliations"
  ADD CONSTRAINT "reconciliations_first_approved_by_user_id_fkey"
  FOREIGN KEY ("first_approved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "reconciliations"
  ADD CONSTRAINT "reconciliations_second_approved_by_user_id_fkey"
  FOREIGN KEY ("second_approved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ledger_entries" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "church_id" TEXT NOT NULL,
  "entry_date" DATE NOT NULL,
  "description" TEXT NOT NULL,
  "status" "LedgerEntryStatus" NOT NULL DEFAULT 'DRAFT',
  "amount_cents" INTEGER NOT NULL,
  "created_by_user_id" TEXT NOT NULL,
  "submitted_at" TIMESTAMP(3),
  "first_approved_by_user_id" TEXT,
  "first_approved_at" TIMESTAMP(3),
  "second_approved_by_user_id" TEXT,
  "second_approved_at" TIMESTAMP(3),
  "rejected_by_user_id" TEXT,
  "rejected_at" TIMESTAMP(3),
  "rejection_reason" TEXT,
  "reversal_of_entry_id" TEXT,
  "import_batch_id" TEXT,
  "reconciliation_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ledger_entries_reversal_of_entry_id_key" ON "ledger_entries"("reversal_of_entry_id");
CREATE INDEX "ledger_entries_organization_id_church_id_status_idx"
  ON "ledger_entries"("organization_id", "church_id", "status");
CREATE INDEX "ledger_entries_church_id_entry_date_idx" ON "ledger_entries"("church_id", "entry_date");
CREATE INDEX "ledger_entries_import_batch_id_idx" ON "ledger_entries"("import_batch_id");
CREATE INDEX "ledger_entries_reconciliation_id_idx" ON "ledger_entries"("reconciliation_id");

ALTER TABLE "ledger_entries"
  ADD CONSTRAINT "ledger_entries_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ledger_entries"
  ADD CONSTRAINT "ledger_entries_church_id_fkey"
  FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ledger_entries"
  ADD CONSTRAINT "ledger_entries_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ledger_entries"
  ADD CONSTRAINT "ledger_entries_first_approved_by_user_id_fkey"
  FOREIGN KEY ("first_approved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ledger_entries"
  ADD CONSTRAINT "ledger_entries_second_approved_by_user_id_fkey"
  FOREIGN KEY ("second_approved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ledger_entries"
  ADD CONSTRAINT "ledger_entries_reversal_of_entry_id_fkey"
  FOREIGN KEY ("reversal_of_entry_id") REFERENCES "ledger_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ledger_entries"
  ADD CONSTRAINT "ledger_entries_import_batch_id_fkey"
  FOREIGN KEY ("import_batch_id") REFERENCES "bank_import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ledger_entries"
  ADD CONSTRAINT "ledger_entries_reconciliation_id_fkey"
  FOREIGN KEY ("reconciliation_id") REFERENCES "reconciliations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ledger_entry_lines" (
  "id" TEXT NOT NULL,
  "entry_id" TEXT NOT NULL,
  "account_id" TEXT NOT NULL,
  "side" "LedgerLineSide" NOT NULL,
  "amount_cents" INTEGER NOT NULL,
  "memo" TEXT,
  CONSTRAINT "ledger_entry_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ledger_entry_lines_entry_id_idx" ON "ledger_entry_lines"("entry_id");
CREATE INDEX "ledger_entry_lines_account_id_idx" ON "ledger_entry_lines"("account_id");

ALTER TABLE "ledger_entry_lines"
  ADD CONSTRAINT "ledger_entry_lines_entry_id_fkey"
  FOREIGN KEY ("entry_id") REFERENCES "ledger_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ledger_entry_lines"
  ADD CONSTRAINT "ledger_entry_lines_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "bank_statement_lines" (
  "id" TEXT NOT NULL,
  "batch_id" TEXT NOT NULL,
  "posted_at" TIMESTAMP(3) NOT NULL,
  "amount_cents" INTEGER NOT NULL,
  "description" TEXT NOT NULL,
  "external_ref" TEXT,
  "match_status" "BankLineMatchStatus" NOT NULL DEFAULT 'UNMATCHED',
  "matched_entry_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bank_statement_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "bank_statement_lines_batch_id_match_status_idx"
  ON "bank_statement_lines"("batch_id", "match_status");
CREATE INDEX "bank_statement_lines_matched_entry_id_idx" ON "bank_statement_lines"("matched_entry_id");

ALTER TABLE "bank_statement_lines"
  ADD CONSTRAINT "bank_statement_lines_batch_id_fkey"
  FOREIGN KEY ("batch_id") REFERENCES "bank_import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bank_statement_lines"
  ADD CONSTRAINT "bank_statement_lines_matched_entry_id_fkey"
  FOREIGN KEY ("matched_entry_id") REFERENCES "ledger_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
