import {
  admissionCurrentStep,
  credentialEligible,
  type AdmissionChecklistDto,
  type AdmissionDto,
  type AdmissionModality,
  type AdmissionStatus,
  type AdmissionStep,
} from "@idbrf/shared";

export interface AdmissionRecord {
  id: string;
  personId: string;
  membershipId: string | null;
  status: string;
  modality: string | null;
  notes: string | null;
  modalityRecordedAt: Date | null;
  documentsCompletedAt: Date | null;
  secretariaDecidedAt: Date | null;
  pastorDecidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  membership: { status: string } | null;
}

export function checklistFromRow(row: AdmissionRecord): AdmissionChecklistDto {
  return {
    modalityRecorded: row.modalityRecordedAt != null,
    documentsComplete: row.documentsCompletedAt != null,
    secretariaApproved: row.secretariaDecidedAt != null,
    pastorApproved: row.status === "APPROVED" && row.pastorDecidedAt != null,
  };
}

export function toAdmissionDto(row: AdmissionRecord): AdmissionDto {
  const checklist = checklistFromRow(row);
  const pastorApproved = checklist.pastorApproved;
  return {
    id: row.id,
    personId: row.personId,
    membershipId: row.membershipId,
    status: row.status as AdmissionStatus,
    modality: (row.modality as AdmissionModality | null) ?? null,
    currentStep: admissionCurrentStep(checklist) satisfies AdmissionStep,
    checklist,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    credentialEligible: credentialEligible({
      admissionStatus: row.status,
      membershipStatus: row.membership?.status ?? null,
      pastorApproved,
    }),
  };
}
