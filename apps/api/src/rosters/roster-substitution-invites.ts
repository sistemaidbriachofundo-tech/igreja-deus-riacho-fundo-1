import { ConflictException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { churchDayKey } from "./church-day";
import { assertNoRosterDayConflict } from "./roster-assignment-transaction";
import { assertSlotEligibility, readModuleRules } from "./roster-operating-rules";
import { DEFAULT_RULES } from "./preview-domain/types";
import { evaluateCandidate } from "./preview-domain/eligibility";
import { utcWeeklyWindowsToRiachoLocal } from "./preview-domain/timezone-availability";

export const inviteKey = (assignmentId: string, personId: string) => `substitute:${assignmentId}:${personId}`;
export const inviteAssignment = {
  slot: { include: { roster: { include: { module: true } } } },
} satisfies Prisma.RosterAssignmentInclude;
type Source = Prisma.RosterAssignmentGetPayload<{ include: typeof inviteAssignment }>;

export async function substitutionCandidates(db: Prisma.TransactionClient, assignment: Source, now: Date) {
  const { slot } = assignment;
  const { roster } = slot;
  const { organizationId, churchId, ministryId } = roster;
  const rules = readModuleRules(roster.module?.rules);
  if (!ministryId || !rules.substituteInviteLimit || slot.requiresCouple || assignment.status !== "DECLINED" ||
      roster.status !== "PUBLISHED" || roster.serviceAt <= now) return [];
  if (await db.rosterAssignment.findFirst({ where: { slotId: slot.id, status: { in: ["PENDING", "CONFIRMED"] } } })) return [];
  const scope = { organizationId, churchId };
  const time = roster.serviceAt.toISOString();
  const month = churchDayKey(roster.serviceAt).slice(0, 7);
  const [year, number] = month.split("-").map(Number);
  const members = await db.ministryMembership.findMany({ where: {
    ...scope, ministryId, status: "ATIVO", person: { status: "ACTIVE" },
    personId: { notIn: [assignment.personId, ...(assignment.partnerPersonId ? [assignment.partnerPersonId] : [])] },
  }, select: { personId: true }, orderBy: { personId: "asc" } });
  const ids = members.map(member => member.personId);
  const [responses, windows, impediments, assignments] = await Promise.all([
    db.rosterAvailabilityResponse.findMany({ where: { churchId, month, personId: { in: ids } }, select: { personId: true, rosterIds: true } }),
    db.volunteerAvailability.findMany({ where: { ...scope, personId: { in: ids }, active: true } }),
    db.volunteerImpediment.findMany({ where: { ...scope, personId: { in: ids }, startsAt: { lte: roster.serviceAt }, endsAt: { gt: roster.serviceAt } } }),
    db.rosterAssignment.findMany({ where: {
      status: { in: ["PENDING", "CONFIRMED"] }, OR: [{ personId: { in: ids } }, { partnerPersonId: { in: ids } }],
      slot: { roster: { ...scope, serviceAt: { gte: new Date(Date.UTC(year, number - 1, -60, 3)), lt: new Date(Date.UTC(year, number, 61, 3)) } } },
    }, include: { slot: { include: { roster: true } } } }),
  ]);
  const response = new Map(responses.map(row => [row.personId, row.rosterIds]));
  const candidates = members.filter(({ personId }) => {
    const answer = response.get(personId);
    return answer ? answer.includes(roster.id) : windows.some(window => window.personId === personId);
  }).map(({ personId }) => ({
    personId, active: true, churchIds: [churchId], ministryIds: [ministryId], qualifiedPositionIds: [slot.id],
    approvedRoleTags: Object.keys(rules.qualifications).filter(tag => rules.qualifications[tag].includes(personId)),
    availability: utcWeeklyWindowsToRiachoLocal(windows.filter(window => window.personId === personId)),
    impediments: impediments.filter(item => item.personId === personId).map(item => ({ startsAt: item.startsAt.toISOString(), endsAt: item.endsAt.toISOString() })),
  }));
  const history = assignments.map(item => ({ ...item, assignmentId: item.id, positionId: item.slotId, rosterId: item.slot.rosterId,
    churchId, ministryId: item.slot.roster.ministryId ?? "", serviceAt: item.slot.roster.serviceAt.toISOString(),
  }));
  return candidates.filter(candidate => evaluateCandidate(candidate, {
    slotId: slot.id, positionId: slot.id, rosterId: roster.id, roleLabel: slot.roleLabel,
    churchId, ministryId, serviceAt: time, serviceType: "special_event",
    requiredRoleTags: slot.requiredQualification ? [slot.requiredQualification] : [],
  }, candidates, history, { ...DEFAULT_RULES, minIntervalDays: rules.minIntervalDays, maxMonthlyAssignments: rules.maxMonthlyAssignments }).eligible)
    .map(candidate => candidate.personId);
}

export async function acceptSubstitute(tx: Prisma.TransactionClient, assignment: Source, personId: string, now: Date) {
  const { slot } = assignment;
  const { roster } = slot;
  if (!(await substitutionCandidates(tx, assignment, now)).includes(personId)) {
    throw new ConflictException("Este convite não está mais disponível.");
  }
  await assertSlotEligibility(tx, slot, [personId]);
  await assertNoRosterDayConflict(tx, { churchId: roster.churchId, serviceAt: roster.serviceAt, personIds: [personId], conflictCode: "ROSTER_SAME_DAY" });
  await tx.rosterAssignment.update({ where: { id: assignment.id }, data: { status: "SUBSTITUTED" } });
  return tx.rosterAssignment.create({ data: { slotId: slot.id, personId, status: "CONFIRMED", confirmedAt: now, substituteForId: assignment.id } });
}
