import {
  ADMISSION_STEP_ORDER,
  ADMISSION_STATUSES,
  type AdmissionStatus,
  type AdmissionStep,
} from "./api-contracts/enums";

export interface AdmissionChecklistState {
  modalityRecorded: boolean;
  documentsComplete: boolean;
  secretariaApproved: boolean;
  pastorApproved: boolean;
}

/** Próxima etapa na ordem fixa (ou a própria se for a última). */
export function nextAdmissionStep(step: AdmissionStep): AdmissionStep {
  const idx = ADMISSION_STEP_ORDER.indexOf(step);
  if (idx < 0 || idx >= ADMISSION_STEP_ORDER.length - 1) {
    return step;
  }
  return ADMISSION_STEP_ORDER[idx + 1]!;
}

/**
 * Valida se `completeStep` pode ser concluída dado o checklist atual.
 * Não permite pular (DAS / protótipo v5).
 */
export function assertAdmissionStepAllowed(
  completeStep: AdmissionStep,
  checklist: AdmissionChecklistState,
): { ok: true } | { ok: false; code: "ADMISSION_STEP_LOCKED"; message: string } {
  if (completeStep === "modality") {
    return { ok: true };
  }
  if (completeStep === "documents") {
    if (!checklist.modalityRecorded) {
      return {
        ok: false,
        code: "ADMISSION_STEP_LOCKED",
        message: "Etapa documents bloqueada até registrar modalidade",
      };
    }
    return { ok: true };
  }
  if (completeStep === "secretaria") {
    if (!checklist.modalityRecorded || !checklist.documentsComplete) {
      return {
        ok: false,
        code: "ADMISSION_STEP_LOCKED",
        message: "Etapa secretaria bloqueada até modalidade e documentos",
      };
    }
    return { ok: true };
  }
  if (completeStep === "pastor") {
    if (
      !checklist.modalityRecorded ||
      !checklist.documentsComplete ||
      !checklist.secretariaApproved
    ) {
      return {
        ok: false,
        code: "ADMISSION_STEP_LOCKED",
        message: "Etapa pastor bloqueada até secretaria aprovar",
      };
    }
    return { ok: true };
  }
  return {
    ok: false,
    code: "ADMISSION_STEP_LOCKED",
    message: "Etapa desconhecida",
  };
}

export function isCredentialEligible(status: AdmissionStatus): boolean {
  return status === ADMISSION_STATUSES.APPROVED;
}
