import type {Candidate, CandidateDecision, ExistingAssignment, RejectionCode, Rules, SlotDemand} from './types';
import {belongsToWindow, isActiveStatus, isMorning, localDayDifference, localParts} from './time';

function evaluateSingle(candidate: Candidate, slot: SlotDemand, assignments: readonly ExistingAssignment[], rules: Rules,
  ignoreCouple: boolean, byId: ReadonlyMap<string,Candidate>): RejectionCode[] {
  const reasons: RejectionCode[] = [];
  const local = localParts(slot.serviceAt, rules.timeZone);
  if (!candidate.active) reasons.push('INACTIVE');
  if (!candidate.churchIds.includes(slot.churchId)) reasons.push('OUT_OF_CHURCH');
  if (!candidate.ministryIds.includes(slot.ministryId)) reasons.push('NOT_IN_MINISTRY');
  if (!candidate.qualifiedPositionIds.includes(slot.positionId)) reasons.push('POSITION_NOT_QUALIFIED');
  if (slot.requiredRoleTags?.some(tag => !candidate.approvedRoleTags.includes(tag))) reasons.push('ROLE_NOT_APPROVED');
  if (candidate.onlyMorning && !isMorning(local.minuteOfDay)) reasons.push('MORNING_ONLY');
  if (candidate.onlyEvening && isMorning(local.minuteOfDay)) reasons.push('EVENING_ONLY');
  if (candidate.onlyFirstSunday && local.weekday === 0 && local.dayOfMonth > 7) reasons.push('FIRST_SUNDAY_ONLY');
  if (candidate.onlySecondSunday && local.weekday === 0 && (local.dayOfMonth < 8 || local.dayOfMonth > 14)) reasons.push('SECOND_SUNDAY_ONLY');
  if (rules.respectAvailability) {
    if (!candidate.availability.length && rules.requireExplicitAvailability) reasons.push('NO_AVAILABILITY');
    else if (candidate.availability.length && !belongsToWindow(local.minuteOfDay,local.weekday,candidate.availability)) reasons.push('NO_AVAILABILITY');
  }
  if (candidate.monthlyAvailableDays === undefined && rules.requireMonthlyAvailabilityResponse) reasons.push('MONTHLY_UNANSWERED');
  else if (candidate.monthlyAvailableDays !== undefined && !candidate.monthlyAvailableDays.includes(local.date)) reasons.push('MONTHLY_NOT_AVAILABLE');
  if (candidate.impediments?.some(i => new Date(i.startsAt).getTime() <= new Date(slot.serviceAt).getTime() && new Date(slot.serviceAt).getTime() < new Date(i.endsAt).getTime())) reasons.push('IMPEDIMENT');
  const active = assignments.filter(a => isActiveStatus(a.status) && (a.personId === candidate.personId || a.partnerPersonId === candidate.personId));
  if (rules.avoidDoubleBooking && active.some(a => localParts(a.serviceAt,rules.timeZone).date === local.date)) reasons.push('DAY_CONFLICT');
  if (rules.minIntervalDays > 0 && active.some(a => localDayDifference(a.serviceAt,slot.serviceAt,rules.timeZone) < rules.minIntervalDays)) reasons.push('MIN_INTERVAL');
  const thisMonth = active.filter(a => localParts(a.serviceAt,rules.timeZone).month === local.month);
  if (thisMonth.length >= rules.maxMonthlyAssignments) reasons.push('MONTHLY_LIMIT');
  const samePositionMonth = thisMonth.filter(a => a.positionId === slot.positionId).length;
  if ((slot.rotationRule === 'NO_REPEAT_SAME_MONTH' || slot.rotationRule === 'ONCE_PER_MONTH') && samePositionMonth > 0) reasons.push('ROTATION_LIMIT');
  if (rules.familySameDayBlock && candidate.familyGroupId) {
    const relatives = [...byId.values()].filter(c=>c.personId !== candidate.personId && c.familyGroupId && c.familyGroupId === candidate.familyGroupId).map(c=>c.personId);
    if (active.length === 0 && assignments.some(a => isActiveStatus(a.status) && (relatives.includes(a.personId) || !!a.partnerPersonId && relatives.includes(a.partnerPersonId)) && localParts(a.serviceAt,rules.timeZone).date === local.date && a.serviceAt !== slot.serviceAt)) reasons.push('FAMILY_DAY_CONFLICT');
  }
  if (!ignoreCouple && (slot.requiresCouple || (rules.enforceCouples && candidate.serveAsCouple))) {
    if (!candidate.spousePersonId && !candidate.coupleExceptionApproved) reasons.push('COUPLE_REQUIRED');
  }
  return [...new Set(reasons)];
}

/** Retorna justificativas auditáveis; função pura, sem alteração de banco. */
export function evaluateCandidate(candidate: Candidate, slot: SlotDemand, people: readonly Candidate[],
  assignments: readonly ExistingAssignment[], rules: Rules): CandidateDecision {
  const byId = new Map(people.map(p=>[p.personId,p] as const));
  const reasons=evaluateSingle(candidate,slot,assignments,rules,false,byId);
  const needPair = !!candidate.spousePersonId && (slot.requiresCouple || (rules.enforceCouples && !!candidate.serveAsCouple));
  const personIds=[candidate.personId];
  if (needPair && candidate.spousePersonId) {
    const partner=byId.get(candidate.spousePersonId);
    if (!partner || partner.personId === candidate.personId) reasons.push('COUPLE_NOT_ELIGIBLE');
    else {
      const partnerReasons=evaluateSingle(partner,slot,assignments,rules,true,byId);
      if (partnerReasons.length) reasons.push('COUPLE_NOT_ELIGIBLE');
      else personIds.push(partner.personId);
    }
  }
  const distinct=[...new Set(reasons)];
  return {eligible:distinct.length===0,reasons:distinct,score:null,personIds};
}
