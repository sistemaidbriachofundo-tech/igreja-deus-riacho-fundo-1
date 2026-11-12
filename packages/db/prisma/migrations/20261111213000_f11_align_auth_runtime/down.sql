-- Reverte só o alinhamento. Rodar antes do down.sql de 20261111193000.
-- Não apaga auth_sessions nem mfa_challenges criadas pela migração anterior.

DROP TABLE IF EXISTS "auth_attempt_windows";

ALTER TABLE "mfa_challenges" DROP COLUMN IF EXISTS "reads";
ALTER TABLE "mfa_challenges" DROP COLUMN IF EXISTS "challenge_kind";

ALTER TABLE "auth_sessions" DROP COLUMN IF EXISTS "mfa_satisfied";
ALTER TABLE "auth_sessions" DROP COLUMN IF EXISTS "authz_fingerprint";
