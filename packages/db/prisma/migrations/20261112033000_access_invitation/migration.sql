-- F1.2 / somente QA até aprovação de produção
CREATE TABLE IF NOT EXISTS "access_invitations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "sent_at" TIMESTAMP(3),
    "consumed_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "access_invitations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "access_invitations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "access_invitations_token_hash_key" ON "access_invitations"("token_hash");
CREATE INDEX IF NOT EXISTS "access_invitations_user_id_expires_at_idx" ON "access_invitations"("user_id", "expires_at");
