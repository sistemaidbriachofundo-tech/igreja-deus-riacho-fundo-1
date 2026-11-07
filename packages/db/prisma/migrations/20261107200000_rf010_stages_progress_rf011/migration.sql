-- RF-010: etapas ordenadas de trilha + histórico granular de progresso
-- RF-011: sem schema novo (relatório operacional sobre GroupMeetingAttendance)

CREATE TYPE "DiscipleshipProgressKind" AS ENUM ('STARTED', 'COMPLETED', 'REOPENED');

CREATE TABLE "discipleship_track_stages" (
    "id" TEXT NOT NULL,
    "track_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "code" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discipleship_track_stages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "discipleship_progress_events" (
    "id" TEXT NOT NULL,
    "enrollment_id" TEXT NOT NULL,
    "stage_id" TEXT NOT NULL,
    "kind" "DiscipleshipProgressKind" NOT NULL,
    "note" TEXT,
    "recorded_by_user_id" TEXT,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discipleship_progress_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "discipleship_track_stages_track_id_sort_order_key" ON "discipleship_track_stages"("track_id", "sort_order");
CREATE UNIQUE INDEX "discipleship_track_stages_track_id_code_key" ON "discipleship_track_stages"("track_id", "code");
CREATE INDEX "discipleship_track_stages_track_id_idx" ON "discipleship_track_stages"("track_id");

CREATE INDEX "discipleship_progress_events_enrollment_id_recorded_at_idx" ON "discipleship_progress_events"("enrollment_id", "recorded_at");
CREATE INDEX "discipleship_progress_events_stage_id_idx" ON "discipleship_progress_events"("stage_id");

ALTER TABLE "discipleship_track_stages" ADD CONSTRAINT "discipleship_track_stages_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "discipleship_tracks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "discipleship_progress_events" ADD CONSTRAINT "discipleship_progress_events_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "discipleship_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "discipleship_progress_events" ADD CONSTRAINT "discipleship_progress_events_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "discipleship_track_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
