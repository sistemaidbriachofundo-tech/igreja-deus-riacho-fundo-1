import { BusinessException } from "../common/business.exception";

export interface MembershipNotesPatch {
  notes?: string | null;
  expectedUpdatedAt?: string;
  status?: string;
  leftAt?: string | null;
}

export function rejectMembershipRegulatedPatch(input: MembershipNotesPatch): void {
  if (input.status !== undefined) {
    throw new BusinessException(
      "Situação do vínculo não muda neste PATCH. ACTIVE segue a aprovação pastoral da admissão, TRANSFERRED segue a transferência, e INACTIVE não tem fluxo regulado.",
      "MEMBERSHIP_STATUS_REGULATED",
      400,
    );
  }
  if (input.leftAt !== undefined) {
    throw new BusinessException(
      "Data de saída do vínculo só é gravada pelo fluxo de transferência.",
      "MEMBERSHIP_LEFT_AT_REGULATED",
      400,
    );
  }
}

export function normalizeMembershipNotes(value: string | null): string | null {
  if (value === null) return null;
  const notes = value.trim();
  if (notes.length > 4000) {
    throw new BusinessException(
      "Observação do vínculo excede 4000 caracteres.",
      "MEMBERSHIP_NOTES_INVALID",
      400,
    );
  }
  return notes.length === 0 ? null : notes;
}

export function parseExpectedUpdatedAt(value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BusinessException(
      "expectedUpdatedAt precisa ser uma data ISO-8601.",
      "VERSION_INVALID",
      400,
    );
  }
  return date;
}
