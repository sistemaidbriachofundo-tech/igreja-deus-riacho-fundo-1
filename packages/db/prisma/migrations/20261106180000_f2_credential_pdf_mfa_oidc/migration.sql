-- AlterTable: MemberCredential PDF meta
ALTER TABLE "member_credentials" ADD COLUMN "pdf_storage_key" TEXT;
ALTER TABLE "member_credentials" ADD COLUMN "pdf_content_type" TEXT;
ALTER TABLE "member_credentials" ADD COLUMN "pdf_byte_size" INTEGER;
ALTER TABLE "member_credentials" ADD COLUMN "pdf_generated_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "member_credentials_pdf_storage_key_key" ON "member_credentials"("pdf_storage_key");

-- AlterTable: User MFA flag
ALTER TABLE "users" ADD COLUMN "mfa_required" BOOLEAN NOT NULL DEFAULT false;

-- CreateEnum
CREATE TYPE "MfaFactorType" AS ENUM ('TOTP');
CREATE TYPE "MfaFactorStatus" AS ENUM ('DISABLED', 'PENDING_ENROLLMENT', 'ENABLED');
CREATE TYPE "OidcProviderStatus" AS ENUM ('DISABLED', 'CONFIGURED', 'ENABLED');

-- CreateTable
CREATE TABLE "user_mfa_factors" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "factor_type" "MfaFactorType" NOT NULL DEFAULT 'TOTP',
    "status" "MfaFactorStatus" NOT NULL DEFAULT 'DISABLED',
    "secret_ciphertext" TEXT,
    "label" TEXT,
    "verified_at" TIMESTAMP(3),
    "disabled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_mfa_factors_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "oidc_provider_configs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "status" "OidcProviderStatus" NOT NULL DEFAULT 'DISABLED',
    "display_name" TEXT,
    "issuer_url" TEXT,
    "client_id" TEXT,
    "client_secret_ref" TEXT,
    "redirect_uri" TEXT,
    "scopes" TEXT NOT NULL DEFAULT 'openid profile email',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oidc_provider_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_mfa_factors_user_id_factor_type_key" ON "user_mfa_factors"("user_id", "factor_type");
CREATE INDEX "user_mfa_factors_user_id_status_idx" ON "user_mfa_factors"("user_id", "status");
CREATE UNIQUE INDEX "oidc_provider_configs_organization_id_key" ON "oidc_provider_configs"("organization_id");

ALTER TABLE "user_mfa_factors" ADD CONSTRAINT "user_mfa_factors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "oidc_provider_configs" ADD CONSTRAINT "oidc_provider_configs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
