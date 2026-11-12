import { BadRequestException } from "@nestjs/common";

const localDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });
const DAY = 86_400_000;
const civilDay = (date: Date) => date.toISOString().slice(0, 10);

export function secretaryPeriod(from: string | undefined, to: string | undefined, now = new Date()) {
  const today = localDay.format(now);
  const todayAt = new Date(today + "T12:00:00Z");
  const start = from ?? civilDay(new Date(+todayAt - 29 * DAY));
  const end = to ?? today;
  for (const day of [start, end]) {
    const parsed = new Date(day + "T00:00:00Z");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(+parsed) || civilDay(parsed) !== day) {
      throw new BadRequestException("Informe um período com datas válidas.");
    }
  }
  const year = todayAt.getUTCFullYear();
  if (start > end || end > today || start < `${year - 20}-01-01`) {
    throw new BadRequestException("Escolha datas em ordem, entre os últimos 20 anos e hoje.");
  }
  const month = todayAt.getUTCMonth();
  const years = Array.from({ length: 5 }, (_, i) => String(year - 4 + i));
  const months = Array.from({ length: 12 }, (_, i) =>
    civilDay(new Date(Date.UTC(year, month - 11 + i, 1))).slice(0, 7));
  return {
    from: start, to: end, today, todayAt, years, months,
    historyFrom: new Date((start < years[0] + "-01-01" ? start : years[0] + "-01-01") + "T00:00:00-03:00"),
  };
}

type PersonRow = {
  id: string;
  displayName: string;
  kind: string;
  status: string;
  sex: string | null;
  birthDate: Date | null;
  baptismDate: Date | null;
  weddingDate: Date | null;
  firstAttendedOn: Date | null;
  createdAt: Date;
  updatedAt: Date;
  memberships: Array<{ status: string; joinedAt: Date }>;
};

function category(person: PersonRow) {
  const status = person.memberships[0]?.status;
  if (person.status === "INACTIVE" || status === "INACTIVE") return "inativos";
  if (status === "TRANSFERRED") return "transferidos";
  if (status === "PENDING_ADMISSION") return "em_admissao";
  return person.kind === "MEMBER" && status === "ACTIVE" ? "membros" : "nao_membros";
}

type Movement = { at: Date; type: "admissoes" | "transferenciasEntrada" | "transferenciasSaida" };

function elapsedYears(date: Date, today: string) {
  const civil = civilDay(date);
  return Number(today.slice(0, 4)) - date.getUTCFullYear() - Number(today.slice(5) < civil.slice(5));
}

export function buildSecretaryOverview(
  people: PersonRow[],
  movements: Movement[],
  period: ReturnType<typeof secretaryPeriod>,
) {
  const byCategory = { membros: 0, nao_membros: 0, inativos: 0, em_admissao: 0, transferidos: 0 };
  const rows = people.map(person => {
    const group = category(person);
    byCategory[group] += 1;
    return { id: person.id, name: person.displayName, group };
  });
  const active = people.filter((_, index) => ["membros", "nao_membros", "em_admissao"].includes(rows[index].group));
  const age = Array.from({ length: 9 }, (_, i) => ({
    label: i === 8 ? "81 anos ou mais" : `${i === 0 ? 0 : i * 10 + 1} a ${i * 10 + 10} anos`, count: 0,
  }));
  const ageAtFirstAttendance = age.map(row => ({ ...row }));
  const churchTime = ["Menos de 1 ano", "1 a 2 anos", "3 a 4 anos", "5 anos ou mais"].map(label => ({ label, count: 0 }));
  const membershipTime = churchTime.map(row => ({ ...row }));
  const sex = { FEMALE: 0, MALE: 0, OTHER: 0, unknown: 0 };
  let missingBirthDate = 0;
  let missingChurchTime = 0;
  let missingAgeAtAttendance = 0;
  for (const person of active) {
    if (person.birthDate) {
      const years = Math.max(0, elapsedYears(person.birthDate, period.today));
      age[Math.min(8, Math.floor(Math.max(0, years - 1) / 10))].count += 1;
    } else missingBirthDate += 1;
    if (person.firstAttendedOn) {
      const years = elapsedYears(person.firstAttendedOn, period.today);
      churchTime[years < 1 ? 0 : years < 3 ? 1 : years < 5 ? 2 : 3].count += 1;
    } else missingChurchTime += 1;
    if (person.birthDate && person.firstAttendedOn && +person.firstAttendedOn >= +person.birthDate) {
      const years = elapsedYears(person.birthDate, civilDay(person.firstAttendedOn));
      ageAtFirstAttendance[Math.min(8, Math.floor(Math.max(0, years - 1) / 10))].count += 1;
    } else missingAgeAtAttendance += 1;
    if (category(person) === "membros") {
      const years = elapsedYears(person.memberships[0].joinedAt, period.today);
      membershipTime[years < 1 ? 0 : years < 3 ? 1 : years < 5 ? 2 : 3].count += 1;
    }
    if (person.sex === "FEMALE" || person.sex === "MALE" || person.sex === "OTHER") sex[person.sex] += 1;
    else sex.unknown += 1;
  }
  const upcomingDays = Array.from({ length: 7 }, (_, i) => civilDay(new Date(+period.todayAt + i * DAY)));
  const celebrations = (key: "birthDate" | "baptismDate" | "weddingDate") => upcomingDays.flatMap(day =>
    active.flatMap(person => person[key] && civilDay(person[key]).slice(5) === day.slice(5)
      ? [{ id: person.id, name: person.displayName, date: day }]
      : []),
  );
  const recentStart = civilDay(new Date(+period.todayAt - 29 * DAY));
  const recent = (key: "createdAt" | "updatedAt", selected: PersonRow[]) => selected
    .filter(person => localDay.format(person[key]) >= recentStart && localDay.format(person[key]) <= period.today)
    .sort((left, right) => +right[key] - +left[key])
    .map(person => ({ id: person.id, name: person.displayName, date: localDay.format(person[key]) }));
  const counts = () => ({ admissoes: 0, transferenciasEntrada: 0, transferenciasSaida: 0 });
  const byMonth = Object.fromEntries(period.months.map(key => [key, counts()]));
  const byYear = Object.fromEntries(period.years.map(key => [key, counts()]));
  const periodMovements = counts();
  for (const movement of movements) {
    const day = localDay.format(movement.at);
    if (day > period.today) continue;
    if (day >= period.from && day <= period.to) periodMovements[movement.type] += 1;
    const month = byMonth[day.slice(0, 7)];
    const year = byYear[day.slice(0, 4)];
    if (month) month[movement.type] += 1;
    if (year) year[movement.type] += 1;
  }
  return {
    today: period.today,
    period: { from: period.from, to: period.to },
    total: people.length,
    byCategory,
    people: rows,
    demographics: {
      base: active.length, age, missingBirthDate, churchTime, missingChurchTime,
      ageAtFirstAttendance, missingAgeAtAttendance, membershipTime, sex,
    },
    celebrations: { birth: celebrations("birthDate"), baptism: celebrations("baptismDate"), wedding: celebrations("weddingDate") },
    recent: {
      new: recent("createdAt", people),
      changed: recent("updatedAt", people.filter(person => +person.updatedAt > +person.createdAt)),
      visitors: recent("createdAt", people.filter(person => person.kind === "VISITOR")),
    },
    movements: { period: periodMovements, byMonth, byYear },
  };
}
