CREATE TYPE "AccessLinkPurpose" AS ENUM ('ACTIVATION', 'PASSWORD_RESET');

ALTER TABLE "access_invitations"
  ADD COLUMN "purpose" "AccessLinkPurpose" NOT NULL DEFAULT 'ACTIVATION';

CREATE TABLE "private_files" (
  "key" TEXT NOT NULL,
  "bytes" BYTEA NOT NULL,
  CONSTRAINT "private_files_pkey" PRIMARY KEY ("key")
);
