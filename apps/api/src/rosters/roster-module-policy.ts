import { churchDayKey } from "./church-day";
import type { CultType, PositionRule } from "./roster-operating-rules";

/** Cargo na ficha ou no vínculo formal não abre módulo, caixa nem escala. */
export function formalRoleGrantsRosterAccess(role: string | null | undefined): boolean {
  return role === "\u0000";
}

export type RosterScope = "ministry" | "modules";

export type RosterAccess = {
  scope: RosterScope;
  manageModuleMemberships: boolean;
  /** Vazio com escopo ministry significa o ministério inteiro. */
  moduleIds: string[];
};

export function resolveRosterAccess(input: {
  churchWide: boolean;
  ministryLeader: boolean;
  ledModuleIds: readonly string[];
}): RosterAccess {
  if (input.churchWide || input.ministryLeader || input.ledModuleIds.length === 0) {
    return { scope: "ministry", manageModuleMemberships: true, moduleIds: [] };
  }
  return {
    scope: "modules",
    manageModuleMemberships: true,
    moduleIds: [...new Set(input.ledModuleIds)],
  };
}

export function publicPermissions(access: RosterAccess): { scope: RosterScope; manageModuleMemberships: boolean } {
  return { scope: access.scope, manageModuleMemberships: access.manageModuleMemberships };
}

export function rosterInScope(moduleId: string | null | undefined, access: RosterAccess): boolean {
  if (access.scope === "ministry") return true;
  return Boolean(moduleId && access.moduleIds.includes(moduleId));
}

/** Líder de módulo não herda a caixa. A tesouraria continua sendo permissão própria. */
export function moduleLeaderBlockedFromFinance(access: RosterAccess, financeGrant: boolean): boolean {
  return access.scope === "modules" && !financeGrant;
}

export function moduleLookupKey(name: string | null | undefined): string {
  return (name ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
}

const WEEKLY = ["thursday_evening", "sunday_morning", "sunday_evening"] as const;

function weekly(build: (type: typeof WEEKLY[number]) => PositionRule[]): Partial<Record<CultType, PositionRule[]>> {
  return Object.fromEntries(WEEKLY.map(type => [type, build(type)]));
}

function people(label: string, count: number, qualification?: string): PositionRule {
  return { label, count, couple: false, ...(qualification ? { qualification } : {}) };
}

function couples(label: string, count: number): PositionRule {
  return { label, count, couple: true };
}

/** Quantidades do briefing. Exceção já gravada no módulo prevalece. */
export function standardPositions(
  name: string | null | undefined,
  cult: CultType,
  raw: unknown,
): PositionRule[] {
  const key = moduleLookupKey(name);
  if (key === "ceia") {
    const stages = communionStages(raw);
    return Array.from({ length: stages }, (_, index) => people(`Ceia · etapa ${index + 1}`, 4));
  }
  const table = STANDARD[key];
  if (!table || cult === "special_event") return [];
  return table[cult] ?? [];
}

export function effectiveInviteLimit(name: string | null | undefined, raw: unknown, parsed: number): number {
  const source = record(raw);
  if (Object.prototype.hasOwnProperty.call(source, "substituteInviteLimit")) return Math.min(5, parsed);
  const key = moduleLookupKey(name);
  if (key === "ceia") return 0;
  if (key in STANDARD) return 5;
  return Math.min(5, parsed);
}

function communionStages(raw: unknown): number {
  const value = record(raw).communionStages;
  if (value === undefined) return 0;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 12) return 0;
  return value;
}

const STANDARD: Record<string, Partial<Record<CultType, PositionRule[]>>> = {
  recepcao: weekly(type => type === "thursday_evening"
    ? [people("Recepção", 2), people("Recepção", 1, "diaconia")]
    : type === "sunday_morning"
      ? [people("Recepção", 1), people("Recepção", 2, "diaconia")]
      : [people("Recepção", 2), people("Recepção", 2, "diaconia")]),
  "apoio interno": weekly(() => [people("Apoio Interno", 1)]),
  conexao: weekly(() => [people("Conexão", 2)]),
  "ofertas e maquininhas": weekly(type => type === "thursday_evening"
    ? [couples("Ofertas e Maquininhas", 1), people("Ofertas e Maquininhas", 1, "diaconia")]
    : [couples("Ofertas e Maquininhas", 2)]),
};

export type LinkSeed = {
  membershipId: string;
  moduleId: string;
  personId: string;
  ministryId: string;
  churchId: string;
  organizationId: string;
};

type MembershipRow = {
  id: string;
  ministryId: string;
  personId: string;
  status: string;
  endedAt: Date | null;
  churchId: string;
  organizationId: string;
};

/** Só copia volunteerIds explícitos de integrante ativo. Não escolhe módulo por cargo nem por suposição. */
export function explicitModuleLinks(
  modules: readonly { id: string; ministryId: string; rules: unknown }[],
  memberships: readonly MembershipRow[],
  activePeople: ReadonlySet<string>,
): LinkSeed[] {
  const seeds: LinkSeed[] = [];
  const seen = new Set<string>();
  for (const module of modules) {
    const source = record(module.rules);
    if (!Object.prototype.hasOwnProperty.call(source, "volunteerIds") || !Array.isArray(source.volunteerIds)) continue;
    for (const value of source.volunteerIds) {
      if (typeof value !== "string" || !value.trim() || !activePeople.has(value)) continue;
      const membership = memberships.find(item =>
        item.ministryId === module.ministryId && item.personId === value && item.status === "ATIVO" && !item.endedAt);
      if (!membership) continue;
      const key = `${membership.id}:${module.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      seeds.push({
        membershipId: membership.id, moduleId: module.id, personId: value, ministryId: module.ministryId,
        churchId: membership.churchId, organizationId: membership.organizationId,
      });
    }
  }
  return seeds;
}

export function projectVolunteerIds(raw: unknown, volunteerIds: readonly string[] | null): unknown {
  if (!volunteerIds) return raw && typeof raw === "object" ? raw : {};
  const source = record(raw);
  return { ...source, volunteerIds: [...new Set(volunteerIds)] };
}

export type CapacityGroup = {
  id: string;
  label: string;
  defaultCount: number;
  count: number;
  minimumCount: number;
};

export function capacityGroupId(label: string, couple: boolean, qualification?: string | null): string {
  const slug = label.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "vaga";
  return `${slug}:${couple ? "casal" : "pessoa"}:${(qualification ?? "").toLowerCase()}`;
}

export function buildCapacityGroups(input: {
  positions: readonly PositionRule[];
  slots: readonly { id: string; roleLabel: string; requiresCouple: boolean; requiredQualification?: string | null; active: boolean }[];
  overrides: ReadonlyMap<string, number>;
}): CapacityGroup[] {
  const groups = new Map<string, CapacityGroup>();
  for (const position of input.positions) {
    const id = capacityGroupId(position.label, position.couple, position.qualification);
    const current = groups.get(id);
    if (current) current.defaultCount += position.count;
    else groups.set(id, { id, label: position.label, defaultCount: position.count, count: 0, minimumCount: 0 });
  }
  for (const slot of input.slots) {
    const id = capacityGroupId(slot.roleLabel, slot.requiresCouple, slot.requiredQualification);
    const group = groups.get(id) ?? { id, label: slot.roleLabel, defaultCount: 0, count: 0, minimumCount: 0 };
    group.count += 1;
    if (slot.active) group.minimumCount += 1;
    groups.set(id, group);
  }
  return [...groups.values()].map(group => ({
    ...group,
    count: input.overrides.get(group.id) ?? group.count,
  }));
}

export function planCapacityChange(input: {
  groups: readonly CapacityGroup[];
  requested: readonly { id: string; count: number }[];
  slots: readonly { id: string; groupId: string; active: boolean; sortOrder: number }[];
}): { removeIds: string[]; create: { groupId: string; count: number }[] } {
  const known = new Map(input.groups.map(group => [group.id, group]));
  if (input.requested.some(item => !known.has(item.id))) {
    throw Object.assign(new Error("Grupo de vaga desconhecido."), { code: "CAPACITY_UNKNOWN" });
  }
  if (new Set(input.requested.map(item => item.id)).size !== input.requested.length) {
    throw Object.assign(new Error("Grupo de vaga repetido."), { code: "CAPACITY_DUPLICATE" });
  }
  let total = input.slots.length;
  const removeIds: string[] = [];
  const create: { groupId: string; count: number }[] = [];
  for (const item of input.requested) {
    if (!Number.isInteger(item.count) || item.count < 0 || item.count > 30) {
      throw Object.assign(new Error("A quantidade precisa ficar entre 0 e 30."), { code: "CAPACITY_LIMIT" });
    }
    const group = known.get(item.id)!;
    if (item.count < group.minimumCount) {
      throw Object.assign(new Error("A quantidade não pode ficar abaixo das designações ativas."), { code: "CAPACITY_ACTIVE" });
    }
    const current = input.slots.filter(slot => slot.groupId === item.id);
    total += item.count - current.length;
    if (item.count < current.length) {
      const removable = current.filter(slot => !slot.active).sort((left, right) => right.sortOrder - left.sortOrder || (left.id < right.id ? 1 : -1));
      if (removable.length < current.length - item.count) {
        throw Object.assign(new Error("A quantidade não pode ficar abaixo das designações ativas."), { code: "CAPACITY_ACTIVE" });
      }
      removeIds.push(...removable.slice(0, current.length - item.count).map(slot => slot.id));
    } else if (item.count > current.length) create.push({ groupId: item.id, count: item.count - current.length });
  }
  if (total > 100) throw Object.assign(new Error("O culto aceita até 100 vagas."), { code: "CAPACITY_TOTAL" });
  return { removeIds, create };
}

export type ResponseStatus = "PENDING" | "CONFIRMED" | "DECLINED";

export function aggregateResponses(people: readonly string[], latest: ReadonlyMap<string, ResponseStatus>): ResponseStatus {
  const statuses = people.map(personId => latest.get(personId) ?? "PENDING");
  if (statuses.some(status => status === "DECLINED")) return "DECLINED";
  if (statuses.length > 0 && statuses.every(status => status === "CONFIRMED")) return "CONFIRMED";
  return "PENDING";
}

export function responseStatuses(input: {
  actorId: string;
  personId: string;
  partnerPersonId: string | null;
  assignmentStatus: string;
  history: readonly { personId: string; status: string; createdAt: Date }[];
}): { ownResponseStatus?: ResponseStatus; companionResponseStatus?: ResponseStatus } {
  const people = [input.personId, input.partnerPersonId].filter((id): id is string => Boolean(id));
  if (!people.includes(input.actorId)) return {};
  const latest = new Map<string, ResponseStatus>();
  const ordered = [...input.history].sort((left, right) => +left.createdAt - +right.createdAt);
  for (const row of ordered) {
    if (row.status === "PENDING" || row.status === "CONFIRMED" || row.status === "DECLINED") latest.set(row.personId, row.status);
  }
  const fallback = input.assignmentStatus === "CONFIRMED" || input.assignmentStatus === "DECLINED" || input.assignmentStatus === "PENDING"
    ? input.assignmentStatus
    : "PENDING";
  const statusFor = (personId: string): ResponseStatus => latest.get(personId) ?? (latest.size ? "PENDING" : fallback);
  const companion = people.find(personId => personId !== input.actorId);
  return {
    ownResponseStatus: statusFor(input.actorId),
    ...(companion ? { companionResponseStatus: statusFor(companion) } : {}),
  };
}

export function openVacancyText(reasons: readonly string[]): string {
  if (reasons.includes("EMPTY_TEAM")) return "A vaga ficou aberta: o módulo não tem integrante ativo.";
  if (reasons.includes("MONTHLY_UNANSWERED")) return "A vaga ficou aberta: a equipe não informou disponibilidade nesta pesquisa.";
  if (reasons.includes("COUPLE_REQUIRED") || reasons.includes("COUPLE_NOT_ELIGIBLE")) return "A vaga ficou aberta: os dois integrantes do casal precisam ser elegíveis.";
  if (reasons.includes("ROLE_NOT_APPROVED") || reasons.includes("POSITION_NOT_QUALIFIED")) return "A vaga ficou aberta: falta alguém com a habilitação exigida.";
  if (reasons.includes("MIN_INTERVAL") || reasons.includes("MONTHLY_LIMIT") || reasons.includes("DAY_CONFLICT")) {
    return "A vaga ficou aberta: o intervalo de 10 dias, o limite de 3 escalas no mês ou o bloqueio do mesmo dia impediu o sorteio.";
  }
  return "A vaga ficou aberta: ninguém atendeu aos requisitos deste culto.";
}

export function cultsInMonth(month: string): { serviceAt: Date; serviceType: Exclude<CultType, "special_event"> }[] {
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("mês inválido");
  const [year, monthNumber] = month.split("-").map(Number);
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const cults: { serviceAt: Date; serviceType: Exclude<CultType, "special_event"> }[] = [];
  for (let day = 1; day <= days; day += 1) {
    const weekday = new Date(Date.UTC(year, monthNumber - 1, day)).getUTCDay();
    if (weekday === 4) cults.push({ serviceAt: zoned(year, monthNumber, day, 20, 0), serviceType: "thursday_evening" });
    if (weekday === 0) {
      cults.push({ serviceAt: zoned(year, monthNumber, day, 10, 0), serviceType: "sunday_morning" });
      cults.push({ serviceAt: zoned(year, monthNumber, day, 19, 0), serviceType: "sunday_evening" });
    }
  }
  return cults;
}

function zoned(year: number, month: number, day: number, hour: number, minute: number): Date {
  return new Date(Date.UTC(year, month - 1, day, hour + 3, minute));
}

export function surveyMonth(now: Date): string {
  const [year, month] = churchDayKey(now).split("-").map(Number);
  return new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 7);
}

export function surveyIsOpen(now: Date): boolean {
  const day = Number(churchDayKey(now).slice(8, 10));
  return day >= 25 && day <= 28;
}

export function monthsReadyToFill(now: Date): string[] {
  const key = churchDayKey(now);
  const day = Number(key.slice(8, 10));
  const current = key.slice(0, 7);
  return day > 28 ? [current, surveyMonth(now)] : [current];
}

export function leadershipSummaryDue(now: Date): boolean {
  return summaryWindow(now, ["Mon", "Thu"]);
}

export function weeklyConfirmationDue(now: Date): boolean {
  return summaryWindow(now, ["Mon"]);
}

function summaryWindow(now: Date, days: readonly string[]): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const weekday = parts.find(part => part.type === "weekday")?.value ?? "";
  const hour = Number(parts.find(part => part.type === "hour")?.value);
  const minute = Number(parts.find(part => part.type === "minute")?.value);
  const clock = hour * 60 + minute;
  return days.includes(weekday) && clock >= 9 * 60 && clock < 9 * 60 + 30;
}

export function whatsappDevApproved(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.WHATSAPP_PROVIDER ?? "").trim().toLowerCase() === "mock" && env.ROSTER_WHATSAPP_DEV_APPROVED === "true";
}

export function invitePresentation(notice: { title: string; body: string; expiresAt: Date | null; inviteStatus: string }) {
  return { title: notice.title, body: notice.body, expiresAt: notice.expiresAt, inviteStatus: notice.inviteStatus };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
