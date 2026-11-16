/** Contratos de domínio independentes de NestJS, Prisma, Drizzle e tRPC. */
export type AssignmentStatus = 'PENDING' | 'CONFIRMED' | 'DECLINED' | 'SUBSTITUTED';
export type RotationRule = 'NONE' | 'ONCE_PER_MONTH' | 'NO_REPEAT_SAME_MONTH' | 'AVOID_NEXT_MONTH';
export type ServiceType = 'wednesday_afternoon' | 'wednesday_evening' | 'thursday_evening' | 'sunday_morning' | 'sunday_evening' | 'special_event';

/** Cada janela usa DIA e MINUTOS LOCAIS da congregação. Adaptador converte dados legados UTC. */
export interface LocalAvailabilityWindow { weekday: number; startMinute: number; endMinute: number }
export interface BlockedInterval { startsAt: string; endsAt: string }
export interface Candidate {
  personId: string;
  active: boolean;
  churchIds: readonly string[];
  ministryIds: readonly string[];
  qualifiedPositionIds: readonly string[];
  approvedRoleTags: readonly string[];
  availability: readonly LocalAvailabilityWindow[];
  impediments?: readonly BlockedInterval[];
  /** Ausência = não respondeu à pesquisa mensal; [] = respondeu nenhum dia. */
  monthlyAvailableDays?: readonly string[];
  spousePersonId?: string | null;
  serveAsCouple?: boolean;
  coupleExceptionApproved?: boolean;
  onlyMorning?: boolean;
  onlyEvening?: boolean;
  onlyFirstSunday?: boolean;
  onlySecondSunday?: boolean;
  familyGroupId?: string | null;
}
export interface SlotDemand {
  priority?: number;
  slotId: string;
  rosterId: string;
  churchId: string;
  ministryId: string;
  positionId: string;
  serviceAt: string; // ISO-8601 with timezone/UTC
  serviceType: ServiceType;
  roleLabel: string;
  servicePoint?: string | null;
  sectorLabel?: string | null;
  requiresCouple?: boolean;
  requiredRoleTags?: readonly string[];
  rotationRule?: RotationRule;
}
export interface ExistingAssignment {
  assignmentId: string;
  churchId: string;
  ministryId: string;
  positionId: string;
  rosterId: string;
  slotId: string;
  serviceAt: string;
  status: AssignmentStatus;
  personId: string;
  partnerPersonId?: string | null;
}
export interface Rules {
  timeZone: string;
  minIntervalDays: number;
  maxMonthlyAssignments: number;
  avoidDoubleBooking: boolean;
  respectAvailability: boolean;
  requireExplicitAvailability: boolean;
  requireMonthlyAvailabilityResponse: boolean;
  enforceCouples: boolean;
  familySameDayBlock: boolean;
}
export const DEFAULT_RULES: Readonly<Rules> = Object.freeze({
  timeZone: 'America/Sao_Paulo',
  minIntervalDays: 10,
  maxMonthlyAssignments: 3,
  avoidDoubleBooking: true,
  respectAvailability: true,
  requireExplicitAvailability: false,
  requireMonthlyAvailabilityResponse: false,
  enforceCouples: true,
  familySameDayBlock: false,
});
export type RejectionCode =
  | 'INACTIVE' | 'OUT_OF_CHURCH' | 'NOT_IN_MINISTRY' | 'POSITION_NOT_QUALIFIED'
  | 'ROLE_NOT_APPROVED' | 'NO_AVAILABILITY' | 'MONTHLY_NOT_AVAILABLE'
  | 'MONTHLY_UNANSWERED' | 'IMPEDIMENT' | 'DAY_CONFLICT' | 'FAMILY_DAY_CONFLICT'
  | 'MIN_INTERVAL' | 'MONTHLY_LIMIT' | 'ROTATION_LIMIT' | 'MORNING_ONLY'
  | 'EVENING_ONLY' | 'FIRST_SUNDAY_ONLY' | 'SECOND_SUNDAY_ONLY'
  | 'COUPLE_REQUIRED' | 'COUPLE_NOT_ELIGIBLE';
export interface CandidateDecision {
  eligible: boolean;
  reasons: RejectionCode[];
  score: number | null;
  personIds: string[];
}
export interface RankedCandidate { candidate: Candidate; personIds: string[]; score: number }
