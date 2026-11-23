import { createHash } from "node:crypto";
import { evaluateCandidate } from "./preview-domain/eligibility";
import { previewSlots } from "./preview-domain/scheduler";
import type { Candidate, ExistingAssignment, Rules } from "./preview-domain/types";
import { DEFAULT_RULES } from "./preview-domain/types";
import { buildCapacityGroups, capacityGroupId, cultsInMonth, moduleLookupKey, openVacancyText } from "./roster-module-policy";
import type { CultType, PositionRule } from "./roster-operating-rules";

export const MONTH_SIMULATION_VERSION = 1;

/** Intervalo e máximo mensal valem para designações PENDING/CONFIRMED de qualquer módulo da mesma igreja, no fuso de Brasília. */
export const MONTH_LIMIT_SCOPE = "Designações ativas de qualquer módulo da mesma igreja, contadas no calendário America/Sao_Paulo.";

export type CalendarStatus = "SCHEDULED" | "CANCELLED";
export type ServiceStatus = "MISSING" | "DRAFT" | "PUBLISHED" | "CLOSED" | "CANCELLED";

export type MonthCalendarItem = {
  serviceAt: string;
  serviceType: CultType;
  status: CalendarStatus;
  title?: string;
};

export type MonthModule = {
  id: string;
  name: string;
  manual: boolean;
  /** Louvor funciona por semana, mesmo quando o módulo se chama Voz, Banda etc. */
  louvor?: boolean;
  minIntervalDays: number;
  maxMonthlyAssignments: number;
  positions: Partial<Record<CultType, PositionRule[]>>;
  volunteerIds: string[];
  couples: [string, string][];
  qualifications: Record<string, string[]>;
};

export type MonthPerson = {
  personId: string;
  name: string;
  ministryIds: string[];
  householdId?: string | null;
  onlyMorning?: boolean;
  onlyEvening?: boolean;
  onlyFirstSunday?: boolean;
  onlySecondSunday?: boolean;
  availability: Candidate["availability"];
  impediments: { startsAt: string; endsAt: string }[];
  /** Datas locais AAAA-MM-DD escolhidas na pesquisa. Ausente = não respondeu. */
  availableDates?: string[];
};

export type MonthSlotState = {
  id: string;
  roleLabel: string;
  requiresCouple: boolean;
  requiredQualification?: string | null;
  personId?: string | null;
  partnerPersonId?: string | null;
};

export type MonthRosterState = {
  id: string;
  moduleId: string;
  serviceAt: string;
  status: "DRAFT" | "PUBLISHED" | "CLOSED";
  title: string;
  slots: MonthSlotState[];
};

export type MonthState = {
  month: string;
  churchId: string;
  ministryId: string;
  calendar: MonthCalendarItem[];
  modules: MonthModule[];
  people: MonthPerson[];
  rosters: MonthRosterState[];
  history: ExistingAssignment[];
  /** A primeira escala de Louvor pode ser sorteada antes de existir uma pesquisa de respostas. */
  monthlySurveyRequired?: boolean;
};

export type MonthPin = { serviceKey: string; slotKey: string; personId: string; partnerPersonId?: string | null };
export type MonthDecision = { slotId: string; personId?: string | null; partnerPersonId?: string | null; locked?: boolean };
export type MonthCapacityRequest = { rosterId: string; groupId: string; count: number };

export type PlannedSlot = {
  key: string;
  id: string | null;
  roleLabel: string;
  requiresCouple: boolean;
  requiredQualification: string | null;
  locked: boolean;
  pinned: boolean;
  personId?: string;
  partnerPersonId?: string | null;
  personName?: string | null;
  partnerName?: string | null;
  reasonCodes: string[];
  openVacancy?: string;
};

export type PlannedService = {
  key: string;
  rosterId: string | null;
  persisted: boolean;
  status: ServiceStatus;
  serviceAt: string;
  serviceType: string;
  title: string;
  moduleId: string;
  moduleName: string;
  manual: boolean;
  minIntervalDays: number;
  maxMonthlyAssignments: number;
  slots: PlannedSlot[];
};

export type MonthSimulation = {
  version: typeof MONTH_SIMULATION_VERSION;
  fingerprint: string;
  timeZone: "America/Sao_Paulo";
  limitScope: string;
  month: string;
  services: PlannedService[];
};

const REASON_TEXT: Record<string, string> = {
  MONTHLY_UNANSWERED: "Não respondeu à pesquisa de 25 a 28.",
  MONTHLY_NOT_AVAILABLE: "Indisponível neste culto na pesquisa.",
  NO_AVAILABILITY: "Indisponível neste horário.",
  IMPEDIMENT: "Impedimento nesta data.",
  DAY_CONFLICT: "Já está escalada neste dia.",
  FAMILY_DAY_CONFLICT: "Outra pessoa da família está em outro horário deste dia.",
  ROLE_NOT_APPROVED: "Sem a habilitação exigida.",
  POSITION_NOT_QUALIFIED: "Sem a habilitação exigida.",
  MIN_INTERVAL: "Ainda não completou o intervalo mínimo configurado.",
  MONTHLY_LIMIT: "Atingiu o máximo de escalas do mês.",
  COUPLE_REQUIRED: "A vaga exige um casal elegível.",
  COUPLE_NOT_ELIGIBLE: "Os dois integrantes do casal precisam ser elegíveis.",
  EMPTY_TEAM: "O módulo não tem integrante ativo.",
  MANUAL_SUBSTITUTION: "A Santa Ceia fica para substituição manual.",
  LOUVOR_WEEK: "Louvor bloqueia a pessoa de segunda a domingo do culto em que ela já está.",
};

export function reasonText(codes: readonly string[]): string {
  const texts = [...new Set(codes.map(code => REASON_TEXT[code] ?? openVacancyText([code])))];
  return texts.join(" ");
}

export function mergeChurchCalendar(month: string, configured: readonly MonthCalendarItem[]): MonthCalendarItem[] {
  const standard = cultsInMonth(month).map(cult => ({
    serviceAt: cult.serviceAt.toISOString(),
    serviceType: cult.serviceType,
    status: "SCHEDULED" as const,
    title: cult.serviceType,
  }));
  const byInstant = new Map<string, MonthCalendarItem>(standard.map(item => [item.serviceAt, item]));
  for (const item of configured) {
    byInstant.set(item.serviceAt, { ...item, serviceAt: new Date(item.serviceAt).toISOString() });
  }
  return [...byInstant.values()].sort((left, right) => left.serviceAt.localeCompare(right.serviceAt));
}

export function monthFingerprint(state: MonthState): string {
  const stable = {
    version: MONTH_SIMULATION_VERSION,
    month: state.month,
    churchId: state.churchId,
    ministryId: state.ministryId,
    calendar: state.calendar.map(item => [item.serviceAt, item.serviceType, item.status]),
    modules: state.modules.map(module => [module.id, [...module.volunteerIds].sort(), module.couples, module.positions, module.qualifications, module.manual, module.minIntervalDays, module.maxMonthlyAssignments, module.louvor ?? false]),
    people: state.people.map(person => [person.personId, person.householdId ?? "", person.availableDates ?? null, person.onlyMorning ?? false, person.onlyEvening ?? false, person.onlyFirstSunday ?? false, person.impediments, person.availability]),
    history: state.history.map(item => [item.assignmentId, item.personId, item.partnerPersonId ?? "", item.serviceAt, item.status, item.ministryId]),
    monthlySurveyRequired: state.monthlySurveyRequired !== false,
    rosters: state.rosters.map(roster => [roster.id, roster.moduleId, roster.serviceAt, roster.status, roster.slots.map(slot => [slot.id, slot.personId ?? "", slot.partnerPersonId ?? ""])]),
  };
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}

export function planMonth(state: MonthState, options: { pins?: readonly MonthPin[]; decisions?: readonly MonthDecision[]; capacities?: readonly MonthCapacityRequest[]; recalculate?: boolean; fillOnlyOpen?: boolean } = {}): MonthSimulation {
  const pins = new Map([
    ...(options.pins ?? []).map(pin => [`${pin.serviceKey}:${pin.slotKey}`, pin] as const),
    ...(options.decisions ?? []).filter(decision => decision.personId).map(decision => [`${decision.slotId}`, { serviceKey: "", slotKey: decision.slotId, personId: decision.personId as string, partnerPersonId: decision.partnerPersonId ?? null }] as const),
  ]);
  const heldOpen = new Set((options.decisions ?? []).filter(decision => decision.locked && !decision.personId).map(decision => decision.slotId));
  const recalculate = options.fillOnlyOpen ?? options.recalculate ?? true;
  const names = new Map(state.people.map(person => [person.personId, person.name]));
  const history: ExistingAssignment[] = state.history.map(item => ({ ...item }));
  for (const roster of state.rosters) {
    for (const slot of roster.slots) {
      if (!slot.personId || history.some(item => item.slotId === slot.id)) continue;
      history.push({
        assignmentId: slot.id, churchId: state.churchId, ministryId: state.ministryId, positionId: slot.roleLabel,
        rosterId: roster.id, slotId: slot.id, serviceAt: roster.serviceAt, status: "PENDING", personId: slot.personId, partnerPersonId: slot.partnerPersonId,
      });
    }
  }
  const services: PlannedService[] = [];
  for (const cult of mergeChurchCalendar(state.month, state.calendar)) {
    for (const module of [...state.modules].sort((left, right) => left.name.localeCompare(right.name, "pt-BR") || left.id.localeCompare(right.id))) {
      const matches = state.rosters.filter(item => item.moduleId === module.id && item.serviceAt === cult.serviceAt);
      const roster = matches.find(item => item.status !== "CLOSED") ?? matches[0];
      const key = `${module.id}:${cult.serviceAt}`;
      const cancelled = cult.status === "CANCELLED";
      const status: ServiceStatus = cancelled ? "CANCELLED" : roster?.status ?? "MISSING";
      const locked = status === "PUBLISHED" || status === "CLOSED" || status === "CANCELLED";
      const slots = applyRequestedCapacity(roster ? slotsFromRoster(roster) : slotsFromPositions(module, cult.serviceType, key), module, cult.serviceType, key, roster?.id ?? null, options.capacities ?? []);
      const candidates = candidatesFor(module, state);
      const planned = slots.map(slot => placeSlot(slot, key, pins, names, locked));
      validatePins(planned, candidates, history, module, state, cult.serviceAt);
      for (const slot of planned.filter(item => item.pinned && item.personId)) history.push(assignmentFrom(slot, cult.serviceAt, state, module.id, roster?.id ?? key));
      const free = planned.filter(slot => !slot.locked && !slot.pinned && !heldOpen.has(slot.key) && !module.manual && status !== "CANCELLED");
      if (recalculate && free.length && module.volunteerIds.length) {
        const rules = rulesFor(module, state.monthlySurveyRequired !== false);
        const plan = previewSlots(free.map(slot => ({
          slotId: slot.key, rosterId: roster?.id ?? key, churchId: state.churchId, ministryId: state.ministryId,
          positionId: slot.roleLabel, roleLabel: slot.roleLabel, requiresCouple: slot.requiresCouple,
          requiredRoleTags: slot.requiredQualification ? [slot.requiredQualification] : [],
          priority: slot.requiresCouple || slot.requiredQualification ? 0 : 1,
          serviceAt: cult.serviceAt, serviceType: cult.serviceType,
        })), candidates, history, rules, personId => module.louvor || /louvor/i.test(module.name)
          ? createHash("sha256").update(`${state.month}|${module.id}|${cult.serviceAt}|${personId}`).digest("hex")
          : personId);
        const picks = new Map(plan.drafts.map(item => [item.slotId, item]));
        const reasons = new Map(plan.unfilled.map(item => [item.slotId, item.reasons]));
        for (const slot of free) {
          const pick = picks.get(slot.key);
          if (pick) {
            slot.personId = pick.personId;
            slot.partnerPersonId = pick.partnerPersonId;
            slot.personName = names.get(pick.personId) ?? null;
            slot.partnerName = pick.partnerPersonId ? names.get(pick.partnerPersonId) ?? null : null;
            history.push(assignmentFrom(slot, cult.serviceAt, state, module.id, roster?.id ?? key));
          } else {
            const codes = reasons.get(slot.key) ?? ["EMPTY_TEAM"];
            slot.reasonCodes = codes;
            slot.openVacancy = reasonText(codes);
          }
        }
      } else if (!module.volunteerIds.length && !locked) {
        for (const slot of planned.filter(item => !item.personId)) {
          slot.reasonCodes = module.manual ? ["MANUAL_SUBSTITUTION"] : ["EMPTY_TEAM"];
          slot.openVacancy = reasonText(slot.reasonCodes);
        }
      } else if (module.manual && !locked) {
        for (const slot of planned.filter(item => !item.personId)) {
          slot.reasonCodes = ["MANUAL_SUBSTITUTION"];
          slot.openVacancy = reasonText(slot.reasonCodes);
        }
      }
      services.push({
        key, rosterId: roster?.id ?? null, persisted: Boolean(roster), status, serviceAt: cult.serviceAt, serviceType: cult.serviceType,
        title: roster?.title ?? `${module.name}`, moduleId: module.id, moduleName: module.name, manual: module.manual,
        minIntervalDays: module.minIntervalDays, maxMonthlyAssignments: module.maxMonthlyAssignments, slots: planned,
      });
    }
  }
  return {
    version: MONTH_SIMULATION_VERSION, fingerprint: monthFingerprint(state), timeZone: "America/Sao_Paulo",
    limitScope: MONTH_LIMIT_SCOPE, month: state.month, services,
  };
}

export type SaveDecision =
  | { action: "write" | "replay"; simulation: MonthSimulation }
  | { action: "stale"; code: "ROSTER_PREVIEW_STALE"; message: string }
  | { action: "ineligible"; code: "ROSTER_NOT_ELIGIBLE"; message: string; serviceKey: string; slotKey: string; reasonCodes: string[] }
  | { action: "published"; code: "ROSTER_PUBLISHED"; message: string; serviceKey: string };

export function decideMonthSave(state: MonthState, request: { fingerprint: string; pins?: readonly MonthPin[]; decisions?: readonly MonthDecision[]; capacities?: readonly MonthCapacityRequest[]; recalculate?: boolean; fillOnlyOpen?: boolean }): SaveDecision {
  const publishedPin = (request.pins ?? []).find(pin => state.rosters.some(roster =>
    `${roster.moduleId}:${roster.serviceAt}` === pin.serviceKey && roster.status !== "DRAFT"));
  const publishedDecision = (request.decisions ?? []).find(decision => state.rosters.some(roster => roster.status !== "DRAFT" && roster.slots.some(slot => slot.id === decision.slotId)));
  if (publishedDecision) return { action: "published", code: "ROSTER_PUBLISHED", message: "Culto publicado não muda nesta gravação.", serviceKey: publishedDecision.slotId };
  if (publishedPin) {
    return { action: "published", code: "ROSTER_PUBLISHED", message: "Culto publicado não muda nesta gravação.", serviceKey: publishedPin.serviceKey };
  }
  const simulation = planMonth(state, request);
  const refused = simulation.services.flatMap(service => service.slots.filter(slot => slot.pinned && !slot.personId).map(slot => ({ service, slot })))[0];
  if (refused) {
    return {
      action: "ineligible", code: "ROSTER_NOT_ELIGIBLE", serviceKey: refused.service.key, slotKey: refused.slot.key,
      reasonCodes: refused.slot.reasonCodes, message: refused.slot.openVacancy ?? "A pessoa fixada não pode ocupar esta vaga.",
    };
  }
  if (request.fingerprint === simulation.fingerprint) return { action: "write", simulation };
  if (replayMatches(simulation, state)) return { action: "replay", simulation: planMonth(state, { ...request, recalculate: false }) };
  return { action: "stale", code: "ROSTER_PREVIEW_STALE", message: "A prévia mudou. Atualize o mês e tente de novo." };
}

function replayMatches(simulation: MonthSimulation, state: MonthState): boolean {
  return simulation.services.every(service => {
    if (service.status === "PUBLISHED" || service.status === "CLOSED" || service.status === "CANCELLED") return true;
    const roster = state.rosters.find(item => item.moduleId === service.moduleId && item.serviceAt === service.serviceAt);
    return service.slots.every(slot => {
      if (!slot.personId) return true;
      const stored = roster?.slots.find(item => item.id === slot.key || item.id === slot.id);
      return stored?.personId === slot.personId && (stored.partnerPersonId ?? null) === (slot.partnerPersonId ?? null);
    });
  });
}

function slotsFromRoster(roster: MonthRosterState): PlannedSlot[] {
  return roster.slots.map(slot => ({
    key: slot.id, id: slot.id, roleLabel: slot.roleLabel, requiresCouple: slot.requiresCouple,
    requiredQualification: slot.requiredQualification ?? null, locked: Boolean(slot.personId), pinned: false,
    ...(slot.personId ? { personId: slot.personId, partnerPersonId: slot.partnerPersonId ?? null } : {}),
    reasonCodes: [],
  }));
}

function applyRequestedCapacity(slots: PlannedSlot[], module: MonthModule, cult: CultType, serviceKey: string, rosterId: string | null, capacities: readonly MonthCapacityRequest[]): PlannedSlot[] {
  const mine = capacities.filter(item => item.rosterId === serviceKey || item.rosterId === rosterId);
  if (!mine.length) return slots;
  const groups = new Map<string, PlannedSlot[]>();
  for (const slot of slots) {
    const id = groupId(slot);
    groups.set(id, [...(groups.get(id) ?? []), slot]);
  }
  for (const request of mine) {
    const current = groups.get(request.groupId) ?? [];
    const position = (module.positions[cult] ?? []).find(item => groupId({ roleLabel: item.label, requiresCouple: item.couple, requiredQualification: item.qualification ?? null }) === request.groupId);
    const ordered = [...current.filter(slot => slot.locked || slot.personId), ...current.filter(slot => !slot.locked && !slot.personId)];
    const next = Math.max(ordered.filter(slot => slot.locked || slot.personId).length, Math.min(30, Math.max(0, Math.trunc(request.count))));
    const kept = ordered.slice(0, next);
    while (kept.length < next && position) {
      kept.push({
        key: `${serviceKey}:${position.label}:${position.couple ? "casal" : "pessoa"}:${position.qualification ?? ""}:${kept.length}`,
        id: null, roleLabel: position.label, requiresCouple: position.couple, requiredQualification: position.qualification ?? null,
        locked: false, pinned: false, reasonCodes: [],
      });
    }
    groups.set(request.groupId, kept);
  }
  return [...groups.values()].flat();
}

function groupId(slot: { roleLabel: string; requiresCouple: boolean; requiredQualification?: string | null }): string {
  return capacityGroupId(slot.roleLabel, slot.requiresCouple, slot.requiredQualification);
}

function slotsFromPositions(module: MonthModule, cult: CultType, serviceKey: string): PlannedSlot[] {
  const positions = module.positions[cult] ?? [];
  return positions.flatMap(position => Array.from({ length: position.count }, (_, index) => ({
    key: `${serviceKey}:${position.label}:${position.couple ? "casal" : "pessoa"}:${position.qualification ?? ""}:${index}`,
    id: null, roleLabel: position.label, requiresCouple: position.couple, requiredQualification: position.qualification ?? null,
    locked: false, pinned: false, reasonCodes: [],
  })));
}

function placeSlot(slot: PlannedSlot, serviceKey: string, pins: ReadonlyMap<string, MonthPin>, names: ReadonlyMap<string, string>, blockPin: boolean): PlannedSlot {
  if (slot.locked) return { ...slot, personName: slot.personId ? names.get(slot.personId) ?? null : null, partnerName: slot.partnerPersonId ? names.get(slot.partnerPersonId) ?? null : null };
  const pin = pins.get(`${serviceKey}:${slot.key}`) ?? pins.get(slot.key);
  if (!pin || blockPin) return { ...slot };
  return { ...slot, pinned: true, personId: pin.personId, partnerPersonId: pin.partnerPersonId ?? null, personName: names.get(pin.personId) ?? null, partnerName: pin.partnerPersonId ? names.get(pin.partnerPersonId) ?? null : null };
}

function candidatesFor(module: MonthModule, state: MonthState): Candidate[] {
  const partners = new Map(module.couples.flatMap(([left, right]) => [[left, right], [right, left]] as const));
  const labels = [...new Set(Object.values(module.positions).flat().map(position => position.label))];
  return state.people.filter(person => module.volunteerIds.includes(person.personId)).map(person => ({
    personId: person.personId, active: true, churchIds: [state.churchId], ministryIds: person.ministryIds,
    qualifiedPositionIds: labels, spousePersonId: partners.get(person.personId) ?? null,
    approvedRoleTags: Object.keys(module.qualifications).filter(tag => module.qualifications[tag].includes(person.personId)),
    availability: person.availability, impediments: person.impediments,
    ...(person.availableDates ? { monthlyAvailableDays: person.availableDates } : {}),
    onlyMorning: person.onlyMorning, onlyEvening: person.onlyEvening, onlyFirstSunday: person.onlyFirstSunday, onlySecondSunday: person.onlySecondSunday,
    familyGroupId: person.householdId, serveAsCouple: false,
  }));
}

function validatePins(slots: PlannedSlot[], candidates: readonly Candidate[], history: ExistingAssignment[], module: MonthModule, state: MonthState, serviceAt: string) {
  for (const slot of slots.filter(item => item.pinned && item.personId)) {
    const candidate = candidates.find(item => item.personId === slot.personId);
    const decision = candidate ? evaluateCandidate(candidate, {
      slotId: slot.key, rosterId: state.ministryId, churchId: state.churchId, ministryId: state.ministryId,
      positionId: slot.roleLabel, roleLabel: slot.roleLabel, requiresCouple: slot.requiresCouple,
      requiredRoleTags: slot.requiredQualification ? [slot.requiredQualification] : [], serviceAt, serviceType: "special_event",
    }, candidates, history, rulesFor(module, state.monthlySurveyRequired !== false)) : { eligible: false, reasons: ["NOT_IN_MINISTRY" as const] };
    if (!decision.eligible || (slot.requiresCouple && slot.partnerPersonId && slot.partnerPersonId !== candidate?.spousePersonId)) {
      slot.personId = undefined;
      slot.partnerPersonId = undefined;
      slot.personName = null;
      slot.partnerName = null;
      slot.reasonCodes = decision.eligible ? ["COUPLE_NOT_ELIGIBLE"] : [...decision.reasons];
      slot.openVacancy = reasonText(slot.reasonCodes);
    }
  }
}

function rulesFor(module: MonthModule, requireMonthlyAvailabilityResponse = true): Rules {
  return {
    ...DEFAULT_RULES, minIntervalDays: module.minIntervalDays, maxMonthlyAssignments: module.maxMonthlyAssignments,
    requireMonthlyAvailabilityResponse, familySameDayBlock: true, enforceCouples: true, avoidDoubleBooking: true, respectAvailability: true,
    louvorWeekBlock: module.louvor === true || /louvor/i.test(module.name),
  };
}

function assignmentFrom(slot: PlannedSlot, serviceAt: string, state: MonthState, moduleId: string, rosterId: string): ExistingAssignment {
  return {
    assignmentId: `plan:${slot.key}`, churchId: state.churchId, ministryId: state.ministryId, positionId: slot.roleLabel,
    rosterId, slotId: slot.key, serviceAt, status: "PENDING", personId: slot.personId ?? "", partnerPersonId: slot.partnerPersonId,
  };
}

export function presentMonthlySimulation(state: MonthState, options: { moduleId?: string; pins?: readonly MonthPin[]; decisions?: readonly MonthDecision[]; capacities?: readonly MonthCapacityRequest[]; recalculate?: boolean; fillOnlyOpen?: boolean } = {}) {
  const scoped = options.moduleId ? { ...state, modules: state.modules.filter(module => module.id === options.moduleId) } : state;
  const simulation = planMonth(scoped, options);
  return {
    month: simulation.month,
    revision: simulation.fingerprint,
    version: simulation.version,
    timeZone: simulation.timeZone,
    limitScope: simulation.limitScope,
    rosters: simulation.services.map(service => {
      const module = scoped.modules.find(item => item.id === service.moduleId);
      const readOnly = service.status === "PUBLISHED" || service.status === "CLOSED" || service.status === "CANCELLED";
      return {
        id: service.rosterId ?? service.key,
        moduleId: service.moduleId,
        moduleName: service.moduleName,
        title: service.title,
        serviceAt: service.serviceAt,
        status: service.status,
        readOnly,
        capacity: module ? buildCapacityGroups({
          positions: module.positions[service.serviceType as CultType] ?? [],
          overrides: new Map(),
          slots: service.slots.map(slot => ({ id: slot.key, roleLabel: slot.roleLabel, requiresCouple: slot.requiresCouple, requiredQualification: slot.requiredQualification, active: Boolean(slot.personId && (slot.locked || slot.pinned)) })),
        }).map(group => ({ id: group.id, label: group.label, count: service.slots.filter(slot => groupId(slot) === group.id).length, minimumCount: group.minimumCount })) : [],
        positions: service.slots.map(slot => {
          const positionReadOnly = readOnly || slot.locked;
          return {
            slotId: slot.key,
            roleLabel: slot.roleLabel,
            requiresCouple: slot.requiresCouple,
            requiredQualification: slot.requiredQualification,
            locked: slot.pinned,
            readOnly: positionReadOnly,
            personId: slot.personId ?? null,
            personName: slot.personName ?? null,
            partnerPersonId: slot.partnerPersonId ?? null,
            partnerName: slot.partnerName ?? null,
            reasons: slot.reasonCodes,
            openVacancy: slot.openVacancy ?? null,
            candidates: positionReadOnly || !module ? [] : listSlotCandidates(scoped, module, service.serviceAt, slot),
          };
        }),
      };
    }),
  };
}

function listSlotCandidates(state: MonthState, module: MonthModule, serviceAt: string, slot: PlannedSlot) {
  const people = candidatesFor(module, state);
  const history = state.history.filter(item => item.slotId !== slot.key);
  return people.flatMap(person => {
    const decision = evaluateCandidate(person, {
      slotId: slot.key, rosterId: state.ministryId, churchId: state.churchId, ministryId: state.ministryId,
      positionId: slot.roleLabel, roleLabel: slot.roleLabel, requiresCouple: slot.requiresCouple,
      requiredRoleTags: slot.requiredQualification ? [slot.requiredQualification] : [], serviceAt, serviceType: "special_event",
    }, people, history, rulesFor(module, state.monthlySurveyRequired !== false));
    if (!decision.eligible) return [];
    const partnerPersonId = decision.personIds[1] ?? null;
    return [{ personId: person.personId, personName: state.people.find(item => item.personId === person.personId)?.name ?? person.personId, partnerPersonId, partnerName: partnerPersonId ? state.people.find(item => item.personId === partnerPersonId)?.name ?? null : null }];
  }).slice(0, 40);
}

export function capacitySlotChanges(service: PlannedService, existingIds: readonly string[]) {
  const kept = new Set(service.slots.flatMap(slot => slot.id ? [slot.id] : []));
  return {
    removeIds: existingIds.filter(id => !kept.has(id)),
    create: service.slots.filter(slot => !slot.id),
  };
}

export function draftsToPersist(simulation: MonthSimulation): Array<{ service: PlannedService; slot: PlannedSlot }> {
  return simulation.services.flatMap(service => {
    if (service.status !== "DRAFT" && service.status !== "MISSING") return [];
    return service.slots.filter(slot => slot.personId && !slot.locked && (!service.manual || slot.pinned)).map(slot => ({ service, slot }));
  });
}

export function moduleIsManual(name: string): boolean {
  return moduleLookupKey(name) === "ceia";
}
