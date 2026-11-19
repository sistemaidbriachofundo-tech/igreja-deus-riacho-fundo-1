CREATE TYPE "EcclesiasticalRole" AS ENUM ('PASTOR', 'EVANGELIST', 'DEACON', 'MINISTRY_LEADER');

ALTER TABLE "church_memberships"
ADD COLUMN "ecclesiastical_roles" "EcclesiasticalRole"[] NOT NULL DEFAULT ARRAY[]::"EcclesiasticalRole"[];
