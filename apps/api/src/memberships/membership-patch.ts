import { ECCLESIASTICAL_ROLES, type EcclesiasticalRole } from "@idbrf/shared";
import { BusinessException } from "../common/business.exception";

export interface MembershipNotesPatch {
  notes?: string | null;
  ecclesiasticalRoles?: EcclesiasticalRole[];
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

export function normalizeEcclesiasticalRoles(roles: EcclesiasticalRole[]) {
  if (!Array.isArray(roles) || roles.some(role => !ECCLESIASTICAL_ROLES.includes(role))) {
    throw new BusinessException("Selecione funções eclesiásticas válidas.", "MEMBERSHIP_ROLES_INVALID", 400);
  }
  return ECCLESIASTICAL_ROLES.filter(role => roles.includes(role));
}

export function membershipLeadershipSelect(scope: { churchId: string; organizationId: string }) {
  const limit = { take: 1, select: { id: true } } as const;
  return {
    ministryLeads: { ...limit, where: { organizationId: scope.organizationId, churchId: scope.churchId } },
    ministryMemberships: {
      ...limit,
      where: { organizationId: scope.organizationId, churchId: scope.churchId, role: "LIDER", status: "ATIVO", endedAt: null },
    },
  };
}
