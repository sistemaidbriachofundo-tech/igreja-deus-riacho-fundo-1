-- RF-016…019: fundos, centros de custo, orçamento, competência/fechamento,
-- anexos de lançamento, status de import OFX real + META_ONLY (PDF).

CREATE TYPE "BankImportStatus_new" AS ENUM ('RECEIVED', 'PARSED', 'PARSED_STUB', 'META_ONLY', 'FAILED');

ALTER TABLE "bank_import_batches"
  ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "bank_import_batches"
  ALTER COLUMN "status" TYPE "BankImportStatus_new"
  USING (
    CASE
      WHEN "status"::text = 'PARSED_STUB' THEN 'PARSED_STUB'::"BankImportStatus_new"
      WHEN "status"::text = 'FAILED' THEN 'FAILED'::"BankImportStatus_new"
      ELSE 'RECEIVED'::"BankImportStatus_new"
    END
  );

DROP TYPE "BankImportStatus";
ALTER TYPE "BankImportStatus_new" RENAME TO "BankImportStatus";

ALTER TABLE "bank_import_batches"
  ALTER COLUMN "status" SET DEFAULT 'RECEIVED'::"BankImportStatus";

CREATE TYPE "BankImportAdapter" AS ENUM ('FILE', 'MOCK', 'SICOOB', 'BRB', 'CORA');

ALTER TABLE "bank_import_batches"
  ADD COLUMN "adapter" "BankImportAdapter" NOT NULL DEFAULT 'FILE';

CREATE TYPE "BudgetStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED');
CREATE TYPE "AccountingPeriodStatus" AS ENUM ('OPEN', 'CLOSED');

CREATE TABLE "cost_centers" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "church_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cost_centers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "funds" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "church_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "funds_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "budgets" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "church_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "status" "BudgetStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "budget_lines" (
    "id" TEXT NOT NULL,
    "budget_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "fund_id" TEXT,
    "cost_center_id" TEXT,
    "planned_cents" INTEGER NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "accounting_periods" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "church_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" "AccountingPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "closed_at" TIMESTAMP(3),
    "closed_by_user_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_periods_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ledger_entry_attachments" (
    "id" TEXT NOT NULL,
    "entry_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "church_id" TEXT NOT NULL,
    "uploaded_by_user_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "storage_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entry_attachments_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ledger_accounts"
  ADD COLUMN "cost_center_id" TEXT;

ALTER TABLE "ledger_entries"
  ADD COLUMN "fund_id" TEXT,
  ADD COLUMN "cost_center_id" TEXT,
  ADD COLUMN "competence_year" INTEGER,
  ADD COLUMN "competence_month" INTEGER;

CREATE UNIQUE INDEX "cost_centers_church_id_code_key" ON "cost_centers"("church_id", "code");
CREATE INDEX "cost_centers_organization_id_church_id_idx" ON "cost_centers"("organization_id", "church_id");

CREATE UNIQUE INDEX "funds_church_id_code_key" ON "funds"("church_id", "code");
CREATE INDEX "funds_organization_id_church_id_idx" ON "funds"("organization_id", "church_id");

CREATE UNIQUE INDEX "budgets_church_id_year_title_key" ON "budgets"("church_id", "year", "title");
CREATE INDEX "budgets_organization_id_church_id_status_idx" ON "budgets"("organization_id", "church_id", "status");

CREATE INDEX "budget_lines_budget_id_idx" ON "budget_lines"("budget_id");
CREATE INDEX "budget_lines_account_id_idx" ON "budget_lines"("account_id");

CREATE UNIQUE INDEX "accounting_periods_church_id_year_month_key" ON "accounting_periods"("church_id", "year", "month");
CREATE INDEX "accounting_periods_organization_id_church_id_status_idx" ON "accounting_periods"("organization_id", "church_id", "status");

CREATE UNIQUE INDEX "ledger_entry_attachments_storage_key_key" ON "ledger_entry_attachments"("storage_key");
CREATE INDEX "ledger_entry_attachments_entry_id_idx" ON "ledger_entry_attachments"("entry_id");
CREATE INDEX "ledger_entry_attachments_organization_id_church_id_idx" ON "ledger_entry_attachments"("organization_id", "church_id");

CREATE INDEX "ledger_accounts_cost_center_id_idx" ON "ledger_accounts"("cost_center_id");
CREATE INDEX "ledger_entries_fund_id_idx" ON "ledger_entries"("fund_id");
CREATE INDEX "ledger_entries_cost_center_id_idx" ON "ledger_entries"("cost_center_id");
CREATE INDEX "ledger_entries_church_id_competence_year_competence_month_idx" ON "ledger_entries"("church_id", "competence_year", "competence_month");
CREATE INDEX "bank_import_batches_adapter_idx" ON "bank_import_batches"("adapter");

ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "funds" ADD CONSTRAINT "funds_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "funds" ADD CONSTRAINT "funds_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "budgets" ADD CONSTRAINT "budgets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_fund_id_fkey" FOREIGN KEY ("fund_id") REFERENCES "funds"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "accounting_periods" ADD CONSTRAINT "accounting_periods_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "accounting_periods" ADD CONSTRAINT "accounting_periods_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "accounting_periods" ADD CONSTRAINT "accounting_periods_closed_by_user_id_fkey" FOREIGN KEY ("closed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ledger_entry_attachments" ADD CONSTRAINT "ledger_entry_attachments_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "ledger_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ledger_entry_attachments" ADD CONSTRAINT "ledger_entry_attachments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ledger_entry_attachments" ADD CONSTRAINT "ledger_entry_attachments_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ledger_entry_attachments" ADD CONSTRAINT "ledger_entry_attachments_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_fund_id_fkey" FOREIGN KEY ("fund_id") REFERENCES "funds"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
