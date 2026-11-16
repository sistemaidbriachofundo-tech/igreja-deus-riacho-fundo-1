CREATE TABLE "ministry_roster_modules" (
    "id" TEXT NOT NULL,
    "ministry_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ministry_roster_modules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ministry_roster_modules_ministry_id_name_key_key" ON "ministry_roster_modules"("ministry_id", "name_key");
CREATE UNIQUE INDEX "ministry_roster_modules_id_ministry_id_key" ON "ministry_roster_modules"("id", "ministry_id");

ALTER TABLE "ministry_roster_modules" ADD CONSTRAINT "ministry_roster_modules_ministry_id_fkey"
    FOREIGN KEY ("ministry_id") REFERENCES "ministries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "rosters" ADD COLUMN "module_id" TEXT;
CREATE INDEX "rosters_module_id_idx" ON "rosters"("module_id");
ALTER TABLE "rosters" ADD CONSTRAINT "rosters_module_requires_ministry_check"
    CHECK ("module_id" IS NULL OR "ministry_id" IS NOT NULL);
ALTER TABLE "rosters" ADD CONSTRAINT "rosters_module_id_ministry_id_fkey"
    FOREIGN KEY ("module_id", "ministry_id") REFERENCES "ministry_roster_modules"("id", "ministry_id") ON DELETE RESTRICT ON UPDATE CASCADE;
