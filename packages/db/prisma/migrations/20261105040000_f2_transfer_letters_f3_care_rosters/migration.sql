-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('DRAFT', 'AWAITING_ORIGIN', 'AWAITING_DESTINATION', 'COMPLETED', 'CANCELLED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ChurchLetterType" AS ENUM ('TRANSFERENCIA', 'RECOMENDACAO', 'MEMBRESIA', 'OUTRO');

-- CreateEnum
CREATE TYPE "ChurchLetterStatus" AS ENUM ('DRAFT', 'ISSUED', 'REVOKED');

-- CreateEnum
CREATE TYPE "PastoralCaseStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PastoralCaseKind" AS ENUM ('VISITA', 'ORACAO', 'ACOLHIMENTO', 'ACOMPANHAMENTO', 'OUTRO');

-- CreateEnum
CREATE TYPE "DiscipleshipEnrollmentStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'PAUSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SmallGroupMemberRole" AS ENUM ('LEADER', 'MEMBER');

-- CreateEnum
CREATE TYPE "RosterStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED');

-- CreateEnum
CREATE TYPE "RosterAssignmentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'DECLINED', 'SUBSTITUTED');

-- CreateTable
CREATE TABLE "membership_transfers" (
    "id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "from_church_id" TEXT NOT NULL,
    "to_church_id" TEXT NOT NULL,
    "from_membership_id" TEXT NOT NULL,
    "to_membership_id" TEXT,
    "status" "TransferStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "rejection_reason" TEXT,
    "requested_by_user_id" TEXT NOT NULL,
    "approved_origin_at" TIMESTAMP(3),
    "approved_dest_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "membership_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "church_letters" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "church_id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "letter_type" "ChurchLetterType" NOT NULL,
    "status" "ChurchLetterStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "body_text" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "supersedes_id" TEXT,
    "issued_by_user_id" TEXT,
    "issued_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "storage_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "church_letters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pastoral_cases" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "church_id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "kind" "PastoralCaseKind" NOT NULL,
    "status" "PastoralCaseStatus" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "assigned_to_user_id" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "due_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pastoral_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pastoral_tasks" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "due_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pastoral_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discipleship_tracks" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "church_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discipleship_tracks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discipleship_enrollments" (
    "id" TEXT NOT NULL,
    "track_id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "mentor_person_id" TEXT,
    "status" "DiscipleshipEnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discipleship_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ministries" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "church_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "leader_person_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ministries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "small_groups" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "church_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "leader_person_id" TEXT,
    "meets_at_hint" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "small_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "small_group_members" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "role" "SmallGroupMemberRole" NOT NULL DEFAULT 'MEMBER',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "small_group_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_meetings" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_meetings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_meeting_attendances" (
    "id" TEXT NOT NULL,
    "meeting_id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "present" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "group_meeting_attendances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rosters" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "church_id" TEXT NOT NULL,
    "ministry_id" TEXT,
    "title" TEXT NOT NULL,
    "service_at" TIMESTAMP(3) NOT NULL,
    "status" "RosterStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rosters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roster_slots" (
    "id" TEXT NOT NULL,
    "roster_id" TEXT NOT NULL,
    "role_label" TEXT NOT NULL,
    "requires_couple" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "roster_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roster_assignments" (
    "id" TEXT NOT NULL,
    "slot_id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "partner_person_id" TEXT,
    "status" "RosterAssignmentStatus" NOT NULL DEFAULT 'PENDING',
    "substitute_for_id" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "declined_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roster_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "membership_transfers_person_id_status_idx" ON "membership_transfers"("person_id", "status");

-- CreateIndex
CREATE INDEX "membership_transfers_organization_id_from_church_id_idx" ON "membership_transfers"("organization_id", "from_church_id");

-- CreateIndex
CREATE INDEX "membership_transfers_organization_id_to_church_id_idx" ON "membership_transfers"("organization_id", "to_church_id");

-- CreateIndex
CREATE UNIQUE INDEX "church_letters_storage_key_key" ON "church_letters"("storage_key");

-- CreateIndex
CREATE INDEX "church_letters_church_id_letter_type_status_idx" ON "church_letters"("church_id", "letter_type", "status");

-- CreateIndex
CREATE INDEX "church_letters_person_id_idx" ON "church_letters"("person_id");

-- CreateIndex
CREATE INDEX "pastoral_cases_church_id_status_idx" ON "pastoral_cases"("church_id", "status");

-- CreateIndex
CREATE INDEX "pastoral_cases_person_id_idx" ON "pastoral_cases"("person_id");

-- CreateIndex
CREATE INDEX "pastoral_cases_assigned_to_user_id_idx" ON "pastoral_cases"("assigned_to_user_id");

-- CreateIndex
CREATE INDEX "pastoral_tasks_case_id_idx" ON "pastoral_tasks"("case_id");

-- CreateIndex
CREATE INDEX "discipleship_tracks_organization_id_church_id_idx" ON "discipleship_tracks"("organization_id", "church_id");

-- CreateIndex
CREATE INDEX "discipleship_enrollments_person_id_idx" ON "discipleship_enrollments"("person_id");

-- CreateIndex
CREATE UNIQUE INDEX "discipleship_enrollments_track_id_person_id_key" ON "discipleship_enrollments"("track_id", "person_id");

-- CreateIndex
CREATE INDEX "ministries_organization_id_church_id_idx" ON "ministries"("organization_id", "church_id");

-- CreateIndex
CREATE UNIQUE INDEX "ministries_church_id_slug_key" ON "ministries"("church_id", "slug");

-- CreateIndex
CREATE INDEX "small_groups_organization_id_church_id_idx" ON "small_groups"("organization_id", "church_id");

-- CreateIndex
CREATE INDEX "small_group_members_person_id_idx" ON "small_group_members"("person_id");

-- CreateIndex
CREATE UNIQUE INDEX "small_group_members_group_id_person_id_key" ON "small_group_members"("group_id", "person_id");

-- CreateIndex
CREATE INDEX "group_meetings_group_id_occurred_at_idx" ON "group_meetings"("group_id", "occurred_at");

-- CreateIndex
CREATE INDEX "group_meeting_attendances_person_id_idx" ON "group_meeting_attendances"("person_id");

-- CreateIndex
CREATE UNIQUE INDEX "group_meeting_attendances_meeting_id_person_id_key" ON "group_meeting_attendances"("meeting_id", "person_id");

-- CreateIndex
CREATE INDEX "rosters_church_id_service_at_idx" ON "rosters"("church_id", "service_at");

-- CreateIndex
CREATE INDEX "rosters_ministry_id_idx" ON "rosters"("ministry_id");

-- CreateIndex
CREATE INDEX "roster_slots_roster_id_idx" ON "roster_slots"("roster_id");

-- CreateIndex
CREATE INDEX "roster_assignments_slot_id_status_idx" ON "roster_assignments"("slot_id", "status");

-- CreateIndex
CREATE INDEX "roster_assignments_person_id_idx" ON "roster_assignments"("person_id");

-- AddForeignKey
ALTER TABLE "membership_transfers" ADD CONSTRAINT "membership_transfers_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_transfers" ADD CONSTRAINT "membership_transfers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_transfers" ADD CONSTRAINT "membership_transfers_from_church_id_fkey" FOREIGN KEY ("from_church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_transfers" ADD CONSTRAINT "membership_transfers_to_church_id_fkey" FOREIGN KEY ("to_church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_transfers" ADD CONSTRAINT "membership_transfers_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "church_letters" ADD CONSTRAINT "church_letters_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "church_letters" ADD CONSTRAINT "church_letters_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "church_letters" ADD CONSTRAINT "church_letters_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "church_letters" ADD CONSTRAINT "church_letters_issued_by_user_id_fkey" FOREIGN KEY ("issued_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "church_letters" ADD CONSTRAINT "church_letters_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES "church_letters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pastoral_cases" ADD CONSTRAINT "pastoral_cases_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pastoral_cases" ADD CONSTRAINT "pastoral_cases_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pastoral_cases" ADD CONSTRAINT "pastoral_cases_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pastoral_cases" ADD CONSTRAINT "pastoral_cases_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pastoral_cases" ADD CONSTRAINT "pastoral_cases_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pastoral_tasks" ADD CONSTRAINT "pastoral_tasks_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "pastoral_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discipleship_tracks" ADD CONSTRAINT "discipleship_tracks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discipleship_tracks" ADD CONSTRAINT "discipleship_tracks_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discipleship_enrollments" ADD CONSTRAINT "discipleship_enrollments_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "discipleship_tracks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discipleship_enrollments" ADD CONSTRAINT "discipleship_enrollments_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discipleship_enrollments" ADD CONSTRAINT "discipleship_enrollments_mentor_person_id_fkey" FOREIGN KEY ("mentor_person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ministries" ADD CONSTRAINT "ministries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ministries" ADD CONSTRAINT "ministries_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ministries" ADD CONSTRAINT "ministries_leader_person_id_fkey" FOREIGN KEY ("leader_person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "small_groups" ADD CONSTRAINT "small_groups_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "small_groups" ADD CONSTRAINT "small_groups_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "small_groups" ADD CONSTRAINT "small_groups_leader_person_id_fkey" FOREIGN KEY ("leader_person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "small_group_members" ADD CONSTRAINT "small_group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "small_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "small_group_members" ADD CONSTRAINT "small_group_members_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_meetings" ADD CONSTRAINT "group_meetings_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "small_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_meeting_attendances" ADD CONSTRAINT "group_meeting_attendances_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "group_meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rosters" ADD CONSTRAINT "rosters_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rosters" ADD CONSTRAINT "rosters_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rosters" ADD CONSTRAINT "rosters_ministry_id_fkey" FOREIGN KEY ("ministry_id") REFERENCES "ministries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roster_slots" ADD CONSTRAINT "roster_slots_roster_id_fkey" FOREIGN KEY ("roster_id") REFERENCES "rosters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roster_assignments" ADD CONSTRAINT "roster_assignments_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "roster_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roster_assignments" ADD CONSTRAINT "roster_assignments_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roster_assignments" ADD CONSTRAINT "roster_assignments_partner_person_id_fkey" FOREIGN KEY ("partner_person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roster_assignments" ADD CONSTRAINT "roster_assignments_substitute_for_id_fkey" FOREIGN KEY ("substitute_for_id") REFERENCES "roster_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

