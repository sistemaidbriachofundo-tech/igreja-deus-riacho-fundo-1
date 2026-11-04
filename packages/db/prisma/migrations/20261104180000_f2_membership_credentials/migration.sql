-- F2 slice: households, church_memberships, member_credentials (piloto single-church).

CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'TRANSFERRED');
CREATE TYPE "CredentialStatus" AS ENUM ('ACTIVE', 'REVOKED');

CREATE TABLE "households" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "church_id" TEXT NOT NULL,
    "label" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "households_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "church_memberships" (
    "id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "church_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "church_memberships_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "member_credentials" (
    "id" TEXT NOT NULL,
    "membership_id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "church_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "status" "CredentialStatus" NOT NULL DEFAULT 'ACTIVE',
    "opaque_token" TEXT NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "issued_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_credentials_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "persons" ADD COLUMN "household_id" TEXT;

CREATE INDEX "households_organization_id_church_id_idx" ON "households"("organization_id", "church_id");

CREATE INDEX "persons_household_id_idx" ON "persons"("household_id");

CREATE INDEX "church_memberships_church_id_status_idx" ON "church_memberships"("church_id", "status");

CREATE INDEX "church_memberships_organization_id_church_id_idx" ON "church_memberships"("organization_id", "church_id");

CREATE UNIQUE INDEX "church_memberships_person_id_church_id_key" ON "church_memberships"("person_id", "church_id");

CREATE UNIQUE INDEX "member_credentials_opaque_token_key" ON "member_credentials"("opaque_token");

CREATE INDEX "member_credentials_person_id_status_idx" ON "member_credentials"("person_id", "status");

CREATE INDEX "member_credentials_church_id_status_idx" ON "member_credentials"("church_id", "status");

CREATE INDEX "member_credentials_membership_id_status_idx" ON "member_credentials"("membership_id", "status");

ALTER TABLE "households" ADD CONSTRAINT "households_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "households" ADD CONSTRAINT "households_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "persons" ADD CONSTRAINT "persons_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "church_memberships" ADD CONSTRAINT "church_memberships_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "church_memberships" ADD CONSTRAINT "church_memberships_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "church_memberships" ADD CONSTRAINT "church_memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "member_credentials" ADD CONSTRAINT "member_credentials_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "church_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "member_credentials" ADD CONSTRAINT "member_credentials_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "member_credentials" ADD CONSTRAINT "member_credentials_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "member_credentials" ADD CONSTRAINT "member_credentials_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "member_credentials" ADD CONSTRAINT "member_credentials_issued_by_user_id_fkey" FOREIGN KEY ("issued_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
