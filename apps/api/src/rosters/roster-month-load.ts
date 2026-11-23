import type { ExistingAssignment } from "./preview-domain/types";
import { utcWeeklyWindowsToRiachoLocal } from "./preview-domain/timezone-availability";
import { churchDayKey } from "./church-day";
import type { MonthCalendarItem, MonthModule, MonthPerson, MonthRosterState, MonthState } from "./roster-month-plan";
import { moduleIsManual } from "./roster-month-plan";
import { positionsForModule, rulesWithTeam, volunteerIdsByModule } from "./roster-module-runtime";
import type { CultType } from "./roster-operating-rules";

type Db = Record<string, unknown> & {
  ministryRosterModule?: { findMany: (args: unknown) => Promise<Array<Record<string, unknown>>> };
  ministryMembership?: { findMany: (args: unknown) => Promise<Array<Record<string, unknown>>> };
  roster?: { findMany: (args: unknown) => Promise<Array<Record<string, unknown>>> };
  rosterAssignment?: { findMany: (args: unknown) => Promise<Array<Record<string, unknown>>> };
  rosterAvailabilityResponse?: { findMany: (args: unknown) => Promise<Array<{ personId: string; rosterIds: string[] }>> };
  volunteerAvailability?: { findMany: (args: unknown) => Promise<Array<{ personId: string; weekday: number; startMinute: number; endMinute: number }>> };
  volunteerImpediment?: { findMany: (args: unknown) => Promise<Array<{ personId: string; startsAt: Date; endsAt: Date }>> };
  churchServiceOccurrence?: { findMany: (args: unknown) => Promise<Array<{ serviceAt: Date; serviceType: string; status: string; title: string | null }>> };
  volunteerServingPreference?: { findMany: (args: unknown) => Promise<Array<Record<string, unknown>>> };
};

const ACTIVE = ["PENDING", "CONFIRMED"] as const;

export async function loadMonthState(
  db: Db,
  pilot: { organizationId: string; churchId: string },
  ministryId: string,
  month: string,
  ministrySlug = "",
): Promise<MonthState | null> {
  if (!db.ministryRosterModule?.findMany || !db.ministryMembership?.findMany || !db.roster?.findMany || !db.rosterAssignment?.findMany || !db.rosterAvailabilityResponse?.findMany || !db.volunteerAvailability?.findMany || !db.volunteerImpediment?.findMany) {
    return null;
  }
  const [year, monthNumber] = month.split("-").map(Number);
  const from = new Date(Date.UTC(year, monthNumber - 1, 1, 3));
  const to = new Date(Date.UTC(year, monthNumber, 1, 3));
  const wide = { gte: new Date(+from - 60 * 86400000), lt: new Date(+to + 60 * 86400000) };
  const scope = { organizationId: pilot.organizationId, churchId: pilot.churchId };
  const [moduleRows, members, rosters, responses, occurrences] = await Promise.all([
    db.ministryRosterModule.findMany({ where: { ministryId }, select: { id: true, name: true, rules: true } }),
    db.ministryMembership.findMany({
      where: { ...scope, ministryId, status: "ATIVO", endedAt: null, person: { status: "ACTIVE" } },
      select: { personId: true, person: { select: { displayName: true, householdId: true } } },
    }),
    db.roster.findMany({
      where: { ...scope, serviceAt: wide },
      select: {
        id: true, ministryId: true, moduleId: true, title: true, serviceAt: true, status: true,
        slots: { select: { id: true, roleLabel: true, requiresCouple: true, requiredQualification: true, assignments: { where: { status: { in: [...ACTIVE] } }, select: { personId: true, partnerPersonId: true, status: true } } } },
      },
    }),
    db.rosterAvailabilityResponse.findMany({ where: { churchId: pilot.churchId, month } }),
    db.churchServiceOccurrence?.findMany({ where: { ...scope, serviceAt: { gte: from, lt: to } } }) ?? Promise.resolve([]),
  ]);
  const teams = await volunteerIdsByModule(db as never, moduleRows.map(module => String(module.id)));
  const isLouvor = /louvor/i.test(ministrySlug);
  const modules = moduleRows.map(module => toModule(module, teams, isLouvor));
  const volunteerIds = [...new Set(modules.flatMap(module => module.volunteerIds))];
  const peopleIds = members.map(member => String(member.personId)).filter(id => !volunteerIds.length || volunteerIds.includes(id));
  const [windows, impediments, preferences] = await Promise.all([
    db.volunteerAvailability.findMany({ where: { ...scope, personId: { in: peopleIds }, active: true } }),
    db.volunteerImpediment.findMany({ where: { ...scope, personId: { in: peopleIds }, startsAt: { lt: to }, endsAt: { gt: from } } }),
    db.volunteerServingPreference?.findMany({ where: { churchId: pilot.churchId, personId: { in: peopleIds } } }) ?? Promise.resolve([]),
  ]);
  const datesByRoster = new Map(rosters.map(roster => [String(roster.id), churchDayKey(new Date(String(roster.serviceAt)))]));
  const preferenceByPerson = new Map(preferences.map(item => [String(item.personId), item]));
  const people: MonthPerson[] = members.filter(member => peopleIds.includes(String(member.personId))).map(member => {
    const person = member.person as { displayName?: string; householdId?: string | null };
    const preference = preferenceByPerson.get(String(member.personId));
    const answer = responses.find(item => item.personId === member.personId);
    return {
      personId: String(member.personId), name: person?.displayName ?? String(member.personId), ministryIds: [ministryId],
      householdId: person?.householdId ?? null,
      availability: utcWeeklyWindowsToRiachoLocal(windows.filter(window => window.personId === member.personId)),
      impediments: impediments.filter(item => item.personId === member.personId).map(item => ({ startsAt: new Date(item.startsAt).toISOString(), endsAt: new Date(item.endsAt).toISOString() })),
      ...(answer ? { availableDates: [...new Set(answer.rosterIds.map(id => datesByRoster.get(id)).filter((date): date is string => Boolean(date)))] } : {}),
      onlyMorning: preference?.onlyMorning === true, onlyEvening: preference?.onlyEvening === true,
      onlyFirstSunday: preference?.onlyFirstSunday === true, onlySecondSunday: preference?.onlySecondSunday === true,
    };
  });
  const history: ExistingAssignment[] = rosters.flatMap(roster => (roster.slots as Array<Record<string, unknown>>).flatMap(slot => {
    const assignment = Array.isArray(slot.assignments) ? slot.assignments[0] as { personId?: string; partnerPersonId?: string | null; status?: string } : undefined;
    if (!assignment?.personId) return [];
    return [{
      assignmentId: String(slot.id), churchId: pilot.churchId, ministryId: String(roster.ministryId ?? ministryId), positionId: String(slot.roleLabel),
      rosterId: String(roster.id), slotId: String(slot.id), serviceAt: new Date(String(roster.serviceAt)).toISOString(),
      status: assignment.status === "CONFIRMED" ? "CONFIRMED" as const : "PENDING" as const,
      personId: assignment.personId, partnerPersonId: assignment.partnerPersonId ?? null,
    }];
  }));
  const monthRosters: MonthRosterState[] = rosters.filter(roster => roster.ministryId === ministryId && churchDayKey(new Date(String(roster.serviceAt))).startsWith(month)).map(roster => ({
    id: String(roster.id), moduleId: String(roster.moduleId ?? ""), serviceAt: new Date(String(roster.serviceAt)).toISOString(),
    status: roster.status === "PUBLISHED" || roster.status === "CLOSED" ? roster.status : "DRAFT", title: String(roster.title),
    slots: (roster.slots as Array<Record<string, unknown>>).map(slot => {
      const assignment = Array.isArray(slot.assignments) ? slot.assignments[0] as { personId?: string; partnerPersonId?: string | null } : undefined;
      return {
        id: String(slot.id), roleLabel: String(slot.roleLabel), requiresCouple: Boolean(slot.requiresCouple),
        requiredQualification: slot.requiredQualification ? String(slot.requiredQualification) : null,
        personId: assignment?.personId ?? null, partnerPersonId: assignment?.partnerPersonId ?? null,
      };
    }),
  }));
  const calendar: MonthCalendarItem[] = occurrences.map(item => ({
    serviceAt: new Date(item.serviceAt).toISOString(),
    serviceType: item.serviceType as CultType,
    status: item.status === "CANCELLED" ? "CANCELLED" : "SCHEDULED",
    title: item.title ?? undefined,
  }));
  // Na primeira geração de Louvor ainda não existem escalas para responder à pesquisa.
  // Respostas existentes são sempre respeitadas, inclusive respostas vazias.
  return { month, churchId: pilot.churchId, ministryId, calendar, modules, people, rosters: monthRosters, history,
    monthlySurveyRequired: !isLouvor || responses.some(response => peopleIds.includes(String(response.personId))) };
}

function toModule(module: Record<string, unknown>, teams: Map<string, string[]> | null, isLouvor: boolean): MonthModule {
  const rules = rulesWithTeam(module.rules, String(module.id), teams);
  const cults = ["thursday_evening", "sunday_morning", "sunday_evening", "special_event"] as const;
  return {
    id: String(module.id), name: String(module.name ?? ""), manual: moduleIsManual(String(module.name ?? "")), louvor: isLouvor,
    minIntervalDays: rules.minIntervalDays, maxMonthlyAssignments: rules.maxMonthlyAssignments,
    positions: Object.fromEntries(cults.map(cult => [cult, positionsForModule(String(module.name ?? ""), cult, module.rules)])),
    volunteerIds: rules.volunteerIds ?? [], couples: rules.couples, qualifications: rules.qualifications,
  };
}
