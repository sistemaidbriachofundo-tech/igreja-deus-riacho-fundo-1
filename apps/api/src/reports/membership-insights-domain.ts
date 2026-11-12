/**
 * Agregações da Secretaria RF1. Não reproduz o Eklesia: usa o contrato nativo
 * de pessoas/vínculos e mantém PII de menores fora de listas nominativas.
 */
import { BadRequestException } from "@nestjs/common";

export type InsightPerson = {
  id: string;
  displayName: string;
  birthDate: Date | null;
  baptismDate: Date | null;
  weddingDate: Date | null;
  firstAttendedOn: Date | null;
  sex: string | null;
  isMinor: boolean;
  createdAt: Date;
};
export type InsightMembership = {
  id: string;
  status: string;
  joinedAt: Date;
  leftAt: Date | null;
  person: InsightPerson;
};
export type InsightTransfer = {
  status: string;
  fromChurchId: string;
  toChurchId: string;
  completedAt: Date | null;
};
export type InsightRecent = { id: string; displayName: string; createdAt: Date; kind: string };
export type InsightInput = {
  memberships: InsightMembership[];
  transfers: InsightTransfer[];
  recentPeople: InsightRecent[];
  registeredPersons: number;
  visitorsActive: number;
  churchId: string;
  churchName: string;
  now: Date;
  period: { from: Date; to: Date };
};

export function parseInsightsPeriod(from?: string, to?: string, today = new Date()) {
  const valid = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value + "T00:00:00.000Z")) &&
    new Date(value + "T00:00:00.000Z").toISOString().slice(0, 10) === value;
  if ((from && !valid(from)) || (to && !valid(to))) throw new BadRequestException("Período inválido. Use AAAA-MM-DD.");
  const finish = to ? new Date(to + "T23:59:59.999Z") : today;
  const start = from ? new Date(from + "T00:00:00.000Z") :
    new Date(Date.UTC(finish.getUTCFullYear(), finish.getUTCMonth() - 11, 1));
  if (start.getTime() > finish.getTime()) throw new BadRequestException("A data inicial deve ser anterior à final.");
  if (finish.getTime() - start.getTime() > 5 * 366 * 86400000)
    throw new BadRequestException("Selecione um período de até cinco anos.");
  return { from: start, to: finish };
}

export function saoPauloDate(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const value = (type: string) => Number(parts.find(p => p.type === type)?.value ?? "0");
  return { year: value("year"), month: value("month"), day: value("day") };
}
function ymd(value: Date) {
  return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1, day: value.getUTCDate() };
}
function dateKey(value: Date) { return value.toISOString().slice(0, 10); }
function monthKey(date: Date) { return date.toISOString().slice(0, 7); }
function yearsSince(value: Date, today: { year: number; month: number; day: number }) {
  const born = ymd(value);
  return today.year - born.year - (today.month < born.month || (today.month === born.month && today.day < born.day) ? 1 : 0);
}
function yearMonthSeries(rows: InsightMembership[], now: Date, period: { from: Date; to: Date }) {
  const monthStart = new Date(Date.UTC(period.from.getUTCFullYear(), period.from.getUTCMonth(), 1));
  const endMonth = new Date(Date.UTC(period.to.getUTCFullYear(), period.to.getUTCMonth(), 1));
  const months: Array<{ label: string; newMemberships: number; exits: number }> = [];
  for (let cursor = monthStart, n = 0; cursor <= endMonth && n < 61; n++, cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))) {
    const key = monthKey(cursor);
    const within = (date: Date) => date >= period.from && date <= period.to && monthKey(date) === key;
    months.push({
      label: key,
      newMemberships: rows.filter(row => within(row.joinedAt)).length,
      exits: rows.filter(row => row.leftAt && within(row.leftAt)).length,
    });
  }
  const yearStart = Math.max(period.from.getUTCFullYear(), now.getUTCFullYear() - 4);
  const years: Array<{ label: string; newMemberships: number; exits: number }> = [];
  for (let year = yearStart; year <= period.to.getUTCFullYear(); year++) {
    years.push({
      label: String(year),
      newMemberships: rows.filter(row => row.joinedAt >= period.from && row.joinedAt <= period.to && row.joinedAt.getUTCFullYear() === year).length,
      exits: rows.filter(row => row.leftAt && row.leftAt >= period.from && row.leftAt <= period.to && row.leftAt.getUTCFullYear() === year).length,
    });
  }
  return { months, years };
}
function anniversary(date: Date, today: { year: number; month: number; day: number }) {
  const original = ymd(date);
  const todayUtc = Date.UTC(today.year, today.month - 1, today.day);
  for (let offset = 0; offset <= 1; offset++) {
    const year = today.year + offset;
    const candidate = new Date(Date.UTC(year, original.month - 1, original.day));
    if (candidate.getUTCMonth() + 1 !== original.month || candidate.getUTCDate() !== original.day) continue;
    const daysAway = Math.round((candidate.getTime() - todayUtc) / 86400000);
    if (daysAway >= 0 && daysAway <= 30)
      return { day: dateKey(candidate), daysAway, years: year - original.year };
  }
  return null;
}
const AGE_BANDS = [
  { label: "0–10", min: 0, max: 10 }, { label: "11–20", min: 11, max: 20 },
  { label: "21–30", min: 21, max: 30 }, { label: "31–40", min: 31, max: 40 },
  { label: "41–50", min: 41, max: 50 }, { label: "51–60", min: 51, max: 60 },
  { label: "61–70", min: 61, max: 70 }, { label: "71–80", min: 71, max: 80 },
  { label: "81+", min: 81, max: 150 },
];
const TENURE_BANDS = [
  { label: "Até 1 ano", min: 0, max: 1 },
  { label: "2–5 anos", min: 2, max: 5 },
  { label: "6–10 anos", min: 6, max: 10 },
  { label: "11–20 anos", min: 11, max: 20 },
  { label: "21+ anos", min: 21, max: 150 },
];
function bars(values: number[], bands: Array<{ label: string }>) {
  return bands.map((band, i) => ({ label: band.label, count: values[i] }));
}

export function buildMembershipInsights(input: InsightInput) {
  const today = saoPauloDate(input.now);
  const grouped: Record<string, number> = { ACTIVE: 0, INACTIVE: 0, PENDING_ADMISSION: 0, TRANSFERRED: 0 };
  for (const row of input.memberships) grouped[row.status] = (grouped[row.status] ?? 0) + 1;
  const active = input.memberships.filter(row => row.status === "ACTIVE");
  const sex: Record<string, number> = { FEMALE: 0, MALE: 0, OTHER: 0, UNKNOWN: 0 };
  const ageCounts = AGE_BANDS.map(() => 0);
  const memberTenureCounts = TENURE_BANDS.map(() => 0);
  const attendingTenureCounts = TENURE_BANDS.map(() => 0);
  let birthUnknown = 0, firstAttendanceUnknown = 0;
  const occasions: Array<{ type: "birthday" | "baptism" | "wedding"; personId: string; name: string; date: string; daysAway: number; years: number }> = [];
  for (const row of active) {
    const p = row.person;
    const sexKey = p.sex && sex[p.sex] !== undefined ? p.sex : "UNKNOWN";
    sex[sexKey]++;
    if (p.birthDate) {
      const years = yearsSince(p.birthDate, today);
      const i = AGE_BANDS.findIndex(b => years >= b.min && years <= b.max);
      if (i !== -1) ageCounts[i]++;
    } else birthUnknown++;
    const joined = yearsSince(row.joinedAt, today);
    const tenureIndex = TENURE_BANDS.findIndex(b => joined >= b.min && joined <= b.max);
    if (tenureIndex !== -1) memberTenureCounts[tenureIndex]++;
    if (p.firstAttendedOn) {
      const attending = yearsSince(p.firstAttendedOn, today);
      const i = TENURE_BANDS.findIndex(b => attending >= b.min && attending <= b.max);
      if (i !== -1) attendingTenureCounts[i]++;
    } else firstAttendanceUnknown++;
    // Nomes de menores não saem em aniversários; dados pessoais completos
    // permanecem disponíveis somente na ficha autorizada.
    if (p.isMinor) continue;
    const dates = [
      { type: "birthday" as const, date: p.birthDate },
      { type: "baptism" as const, date: p.baptismDate },
      { type: "wedding" as const, date: p.weddingDate },
    ];
    for (const event of dates) {
      if (!event.date) continue;
      const ann = anniversary(event.date, today);
      if (ann) occasions.push({ type: event.type, personId: p.id, name: p.displayName, date: ann.day, daysAway: ann.daysAway, years: ann.years });
    }
  }
  occasions.sort((a, b) => a.daysAway - b.daysAway || a.name.localeCompare(b.name, "pt-BR"));
  const nowMs = input.now.getTime();
  const transferFrom = input.transfers.filter(t => t.status === "COMPLETED" && t.fromChurchId === input.churchId && t.completedAt && t.completedAt >= input.period.from && t.completedAt <= input.period.to).length;
  const transferTo = input.transfers.filter(t => t.status === "COMPLETED" && t.toChurchId === input.churchId && t.completedAt && t.completedAt >= input.period.from && t.completedAt <= input.period.to).length;
  const recent = input.recentPeople
    .filter(p => p.createdAt.getTime() <= nowMs && p.createdAt.getTime() >= nowMs - 30 * 86400000)
    .slice(0, 8)
    .map(p => ({ id: p.id, name: p.displayName, date: dateKey(p.createdAt), kind: p.kind }));
  return {
    generatedAt: input.now.toISOString(),
    church: { id: input.churchId, name: input.churchName },
    period: { from: dateKey(input.period.from), to: dateKey(input.period.to) },
    totals: {
      registeredPersons: input.registeredPersons,
      membershipRecords: input.memberships.length,
      activeMembers: grouped.ACTIVE,
      inactiveMembers: grouped.INACTIVE,
      pendingAdmission: grouped.PENDING_ADMISSION,
      transferred: grouped.TRANSFERRED,
      visitorsActive: input.visitorsActive,
    },
    byStatus: grouped,
    bySex: sex,
    ages: { bands: bars(ageCounts, AGE_BANDS), missing: birthUnknown },
    tenure: { attending: bars(attendingTenureCounts, TENURE_BANDS), member: bars(memberTenureCounts, TENURE_BANDS), missingFirstAttendance: firstAttendanceUnknown },
    growth: yearMonthSeries(input.memberships, input.now, input.period),
    movements: { transfersIn: transferTo, transfersOut: transferFrom, netTransfers: transferTo - transferFrom },
    occasions,
    recent,
    coverage: { activeWithBirthDate: active.length - birthUnknown, activeTotal: active.length },
    notes: [
      "Composição e perfil representam o estado atual dos vínculos.",
      "Crescimento mostra entradas e saídas registradas pelas datas disponíveis; não é reconstrução histórica do total de membros ativos.",
      "Listas nominativas excluem menores de idade; números agregados incluem todos os vínculos.",
    ],
  };
}
