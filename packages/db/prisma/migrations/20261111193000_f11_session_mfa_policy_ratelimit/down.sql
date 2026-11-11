-- Reversão manual da migração F1.1. Não apaga linhas antigas de audit_logs.
-- Só remove colunas novas (outcome, request_id), que nascem nulas no histórico anterior.
-- Não executar em produção sem janela e backup restaurável.

DROP TRIGGER IF EXISTS audit_logs_append_only ON audit_logs;
DROP FUNCTION IF EXISTS audit_logs_deny_mutation();
GRANT UPDATE, DELETE ON TABLE audit_logs TO PUBLIC;

ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "request_id";
ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "outcome";
ALTER TABLE "users" DROP COLUMN IF EXISTS "authz_version";

DROP TABLE IF EXISTS "rate_limit_buckets";
DROP TABLE IF EXISTS "mfa_challenges";
DROP TABLE IF EXISTS "auth_sessions";
DROP TABLE IF EXISTS "security_policies";

DROP TYPE IF EXISTS "MfaEnforcementMode";
DROP TYPE IF EXISTS "MfaChallengeStatus";
DROP TYPE IF EXISTS "MfaChallengePurpose";
DROP TYPE IF EXISTS "AuthSessionStatus";
