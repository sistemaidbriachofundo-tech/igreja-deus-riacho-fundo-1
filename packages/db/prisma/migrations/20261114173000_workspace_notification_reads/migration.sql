CREATE TABLE "workspace_notification_reads" (
  "user_id" TEXT NOT NULL,
  "church_id" TEXT NOT NULL,
  "notice_id" TEXT NOT NULL,
  "read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workspace_notification_reads_pkey" PRIMARY KEY ("user_id", "church_id", "notice_id"),
  CONSTRAINT "workspace_notification_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "workspace_notification_reads_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "workspace_notification_reads_church_id_idx" ON "workspace_notification_reads"("church_id");

ALTER TABLE "roster_notices" ADD COLUMN "declined_at" TIMESTAMP(3);

CREATE TYPE "SmallGroupJoinStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED');

CREATE TABLE "small_group_join_requests" (
  "id" TEXT NOT NULL,
  "group_id" TEXT NOT NULL,
  "person_id" TEXT NOT NULL,
  "status" "SmallGroupJoinStatus" NOT NULL DEFAULT 'PENDING',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "small_group_join_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "small_group_join_requests_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "small_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "small_group_join_requests_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "small_group_join_requests_group_id_person_id_key" ON "small_group_join_requests"("group_id", "person_id");
CREATE INDEX "small_group_join_requests_person_id_idx" ON "small_group_join_requests"("person_id");
