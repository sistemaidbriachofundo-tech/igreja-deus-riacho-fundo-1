ALTER TABLE "member_credentials" ADD COLUMN "pdf_portrait_hash" TEXT;
ALTER TABLE "event_payment_intents" ADD COLUMN "bank_credit_reference" TEXT;

CREATE UNIQUE INDEX "event_payment_credit_reference_key"
ON "event_payment_intents" ("church_id", "bank_credit_reference");

ALTER TABLE "auth_sessions" ADD COLUMN "mfa_verified_at" TIMESTAMP(3);
