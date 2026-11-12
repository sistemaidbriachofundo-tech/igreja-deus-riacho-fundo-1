-- Alinha o runtime da frente A às tabelas da frente E.
-- Aditiva. Não reescreve sessões, desafios nem auditoria existentes.
-- Reversão: down.sql desta pasta, antes do down.sql de 20261111193000.

ALTER TABLE "auth_sessions" ADD COLUMN "authz_fingerprint" TEXT;
ALTER TABLE "auth_sessions" ADD COLUMN "mfa_satisfied" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "mfa_challenges" ADD COLUMN "challenge_kind" TEXT;
ALTER TABLE "mfa_challenges" ADD COLUMN "reads" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "auth_attempt_windows" (
    "bucket_key" TEXT NOT NULL,
    "failures" INTEGER NOT NULL,
    "window_started_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_attempt_windows_pkey" PRIMARY KEY ("bucket_key")
);
