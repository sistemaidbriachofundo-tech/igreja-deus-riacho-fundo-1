-- RF-023 EBD/cursos · RF-009 retenção pastoral · RF-030 patrimônio mínimo

CREATE TYPE "CourseStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "CourseClassStatus" AS ENUM ('OPEN', 'CLOSED', 'CANCELLED');
CREATE TYPE "CourseEnrollmentStatus" AS ENUM ('ENROLLED', 'COMPLETED', 'DROPPED', 'CANCELLED');
CREATE TYPE "ChurchAssetStatus" AS ENUM ('ACTIVE', 'MAINTENANCE', 'LOST', 'DISPOSED');
CREATE TYPE "ChurchAssetHistoryKind" AS ENUM ('CREATED', 'UPDATED', 'STATUS_CHANGE', 'LOCATION_CHANGE', 'RESPONSIBLE_CHANGE', 'NOTE');

CREATE TABLE "pastoral_retention_policies" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "church_id" TEXT NOT NULL,
    "closed_case_retention_days" INTEGER NOT NULL DEFAULT 2555,
    "redaction_enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pastoral_retention_policies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pastoral_retention_policies_church_id_key" ON "pastoral_retention_policies"("church_id");
CREATE INDEX "pastoral_retention_policies_organization_id_idx" ON "pastoral_retention_policies"("organization_id");

ALTER TABLE "pastoral_retention_policies" ADD CONSTRAINT "pastoral_retention_policies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pastoral_retention_policies" ADD CONSTRAINT "pastoral_retention_policies_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pastoral_retention_policies" ADD CONSTRAINT "pastoral_retention_policies_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "courses" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "church_id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "CourseStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "courses_church_id_code_key" ON "courses"("church_id", "code");
CREATE INDEX "courses_organization_id_church_id_idx" ON "courses"("organization_id", "church_id");

ALTER TABLE "courses" ADD CONSTRAINT "courses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "courses" ADD CONSTRAINT "courses_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "course_classes" (
    "id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "church_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "teacher_person_id" TEXT,
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "status" "CourseClassStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_classes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "course_classes_course_id_idx" ON "course_classes"("course_id");
CREATE INDEX "course_classes_organization_id_church_id_idx" ON "course_classes"("organization_id", "church_id");

ALTER TABLE "course_classes" ADD CONSTRAINT "course_classes_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "course_classes" ADD CONSTRAINT "course_classes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "course_classes" ADD CONSTRAINT "course_classes_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "course_classes" ADD CONSTRAINT "course_classes_teacher_person_id_fkey" FOREIGN KEY ("teacher_person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "course_enrollments" (
    "id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "status" "CourseEnrollmentStatus" NOT NULL DEFAULT 'ENROLLED',
    "enrolled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "certificate_approved_by_user_id" TEXT,
    "certificate_issued_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_enrollments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "course_enrollments_class_id_person_id_key" ON "course_enrollments"("class_id", "person_id");
CREATE INDEX "course_enrollments_person_id_idx" ON "course_enrollments"("person_id");
CREATE INDEX "course_enrollments_status_idx" ON "course_enrollments"("status");

ALTER TABLE "course_enrollments" ADD CONSTRAINT "course_enrollments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "course_classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "course_enrollments" ADD CONSTRAINT "course_enrollments_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "course_enrollments" ADD CONSTRAINT "course_enrollments_certificate_approved_by_user_id_fkey" FOREIGN KEY ("certificate_approved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "course_sessions" (
    "id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "title" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "course_sessions_class_id_occurred_at_idx" ON "course_sessions"("class_id", "occurred_at");

ALTER TABLE "course_sessions" ADD CONSTRAINT "course_sessions_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "course_classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "course_attendances" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "present" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_attendances_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "course_attendances_session_id_person_id_key" ON "course_attendances"("session_id", "person_id");
CREATE INDEX "course_attendances_person_id_idx" ON "course_attendances"("person_id");

ALTER TABLE "course_attendances" ADD CONSTRAINT "course_attendances_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "course_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "course_attendances" ADD CONSTRAINT "course_attendances_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "church_assets" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "church_id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "responsible_person_id" TEXT,
    "status" "ChurchAssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "acquired_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "church_assets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "church_assets_church_id_code_key" ON "church_assets"("church_id", "code");
CREATE INDEX "church_assets_organization_id_church_id_idx" ON "church_assets"("organization_id", "church_id");
CREATE INDEX "church_assets_status_idx" ON "church_assets"("status");
CREATE INDEX "church_assets_responsible_person_id_idx" ON "church_assets"("responsible_person_id");

ALTER TABLE "church_assets" ADD CONSTRAINT "church_assets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "church_assets" ADD CONSTRAINT "church_assets_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "church_assets" ADD CONSTRAINT "church_assets_responsible_person_id_fkey" FOREIGN KEY ("responsible_person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "church_asset_history" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "kind" "ChurchAssetHistoryKind" NOT NULL,
    "note" TEXT,
    "from_status" "ChurchAssetStatus",
    "to_status" "ChurchAssetStatus",
    "from_location" TEXT,
    "to_location" TEXT,
    "from_responsible_person_id" TEXT,
    "to_responsible_person_id" TEXT,
    "actor_user_id" TEXT,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "church_asset_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "church_asset_history_asset_id_recorded_at_idx" ON "church_asset_history"("asset_id", "recorded_at");

ALTER TABLE "church_asset_history" ADD CONSTRAINT "church_asset_history_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "church_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "church_asset_history" ADD CONSTRAINT "church_asset_history_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
