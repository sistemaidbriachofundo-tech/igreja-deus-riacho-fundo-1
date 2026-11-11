-- F1.1 persistência aditiva. Não altera linhas existentes de audit_logs.
-- Não executar contra produção nem contra o Neon de QA sem autorização explícita.
-- Reversão manual: down.sql nesta pasta. O Prisma não aplica down.sql sozinho.

ALTER TABLE "users" ADD COLUMN "authz_version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "audit_logs" ADD COLUMN "outcome" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "request_id" TEXT;
CREATE INDEX "audit_logs_request_id_idx" ON "audit_logs"("request_id");

CREATE TYPE "AuthSessionStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');
CREATE TYPE "MfaChallengePurpose" AS ENUM ('LOGIN', 'REFRESH', 'SWITCH_CHURCH', 'STEP_UP');
CREATE TYPE "MfaChallengeStatus" AS ENUM ('PENDING', 'CONSUMED', 'EXPIRED', 'REVOKED');
CREATE TYPE "MfaEnforcementMode" AS ENUM ('OFF', 'PRIVILEGED', 'ALL');

CREATE TABLE "auth_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "family_id" TEXT NOT NULL,
    "status" "AuthSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "authz_version" INTEGER NOT NULL,
    "policy_version" INTEGER NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "revoke_reason" TEXT,
    "replaced_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mfa_challenges" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "purpose" "MfaChallengePurpose" NOT NULL,
    "status" "MfaChallengeStatus" NOT NULL DEFAULT 'PENDING',
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mfa_challenges_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "security_policies" (
    "id" TEXT NOT NULL,
    "scope_key" TEXT NOT NULL,
    "organization_id" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "mfa_enforcement" "MfaEnforcementMode" NOT NULL DEFAULT 'PRIVILEGED',
    "privileged_role_codes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "security_policies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "rate_limit_buckets" (
    "id" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "window_start" TIMESTAMP(3) NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "auth_sessions_refresh_token_hash_key" ON "auth_sessions"("refresh_token_hash");
CREATE UNIQUE INDEX "auth_sessions_replaced_by_id_key" ON "auth_sessions"("replaced_by_id");
CREATE INDEX "auth_sessions_user_id_status_idx" ON "auth_sessions"("user_id", "status");
CREATE INDEX "auth_sessions_family_id_idx" ON "auth_sessions"("family_id");
CREATE INDEX "auth_sessions_expires_at_idx" ON "auth_sessions"("expires_at");

CREATE UNIQUE INDEX "mfa_challenges_token_hash_key" ON "mfa_challenges"("token_hash");
CREATE INDEX "mfa_challenges_user_id_status_idx" ON "mfa_challenges"("user_id", "status");
CREATE INDEX "mfa_challenges_expires_at_idx" ON "mfa_challenges"("expires_at");

CREATE UNIQUE INDEX "security_policies_scope_key_key" ON "security_policies"("scope_key");
CREATE INDEX "security_policies_organization_id_idx" ON "security_policies"("organization_id");

CREATE UNIQUE INDEX "rate_limit_buckets_key_hash_window_start_key" ON "rate_limit_buckets"("key_hash", "window_start");
CREATE INDEX "rate_limit_buckets_expires_at_idx" ON "rate_limit_buckets"("expires_at");

ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mfa_challenges" ADD CONSTRAINT "mfa_challenges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "security_policies" ADD CONSTRAINT "security_policies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Imutabilidade lógica. O dono da tabela também é barrado pelo trigger.
-- Exceções: anular actor_user_id quando o usuário é removido (FK SET NULL)
-- e a transação de manutenção do seed sintético (set_config local).
CREATE OR REPLACE FUNCTION audit_logs_deny_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('idbrf.audit_maintenance', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.actor_user_id IS NULL
     AND OLD.actor_user_id IS DISTINCT FROM NEW.actor_user_id
     AND NEW.id IS NOT DISTINCT FROM OLD.id
     AND NEW.action IS NOT DISTINCT FROM OLD.action
     AND NEW.resource_type IS NOT DISTINCT FROM OLD.resource_type
     AND NEW.resource_id IS NOT DISTINCT FROM OLD.resource_id
     AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id
     AND NEW.church_id IS NOT DISTINCT FROM OLD.church_id
     AND NEW.metadata IS NOT DISTINCT FROM OLD.metadata
     AND NEW.outcome IS NOT DISTINCT FROM OLD.outcome
     AND NEW.request_id IS NOT DISTINCT FROM OLD.request_id
     AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'audit_logs are append-only';
END;
$$;

CREATE TRIGGER audit_logs_append_only
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW
EXECUTE FUNCTION audit_logs_deny_mutation();

REVOKE UPDATE, DELETE ON TABLE audit_logs FROM PUBLIC;
