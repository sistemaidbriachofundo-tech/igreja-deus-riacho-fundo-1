export type CountBand = { label: string; count: number };
export type GrowthPoint = { label: string; newMemberships: number; exits: number };
export type MembershipInsightsData = {
  generatedAt: string;
  church: { id: string; name: string };
  period: { from: string; to: string };
  totals: {
    registeredPersons: number;
    membershipRecords: number;
    activeMembers: number;
    inactiveMembers: number;
    pendingAdmission: number;
    transferred: number;
    visitorsActive: number;
  };
  byStatus: Record<string, number>;
  bySex: Record<string, number>;
  ages: { bands: CountBand[]; missing: number };
  tenure: { attending: CountBand[]; member: CountBand[]; missingFirstAttendance: number };
  growth: { months: GrowthPoint[]; years: GrowthPoint[] };
  movements: { transfersIn: number; transfersOut: number; netTransfers: number };
  occasions: Array<{
    type: "birthday" | "baptism" | "wedding";
    personId: string;
    name: string;
    date: string;
    daysAway: number;
    years: number;
  }>;
  recent: Array<{ id: string; name: string; date: string; kind: string }>;
  coverage: { activeWithBirthDate: number; activeTotal: number };
  notes: string[];
};
export const fmtNumber = (n: number): string => n.toLocaleString("pt-BR");
export function formattedDate(value: string): string {
  const date = new Date(value.slice(0, 10) + "T12:00:00.000Z");
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-BR", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" });
}
export function makeCsv(data: MembershipInsightsData): string {
  const escape = (input: string | number): string => {
    const raw = String(input);
    const safe = /^[=+\-@\t\r]/.test(raw) ? "'" + raw : raw;
    return '"' + safe.replaceAll('"', '""') + '"';
  };
  const rows: Array<Array<string | number>> = [
    ["Relatório", "Membresia — ID Riacho 1"],
    ["Congregação", data.church.name],
    ["Gerado em", data.generatedAt],
    ["Período inicial", data.period.from],
    ["Período final", data.period.to],
    ["Indicador", "Total"],
    ["Pessoas cadastradas", data.totals.registeredPersons],
    ["Membros ativos", data.totals.activeMembers],
    ["Membros inativos", data.totals.inactiveMembers],
    ["Em admissão", data.totals.pendingAdmission],
    ["Transferidos", data.totals.transferred],
    ["Visitantes ativos", data.totals.visitorsActive],
    ["Transferências recebidas", data.movements.transfersIn],
    ["Transferências enviadas", data.movements.transfersOut],
    ["Faixa etária", "Pessoas"],
    ...data.ages.bands.map(b => [b.label, b.count]),
    ["Sem nascimento informado", data.ages.missing],
    ["Mês", "Vínculos iniciados", "Vínculos encerrados"],
    ...data.growth.months.map(m => [m.label, m.newMemberships, m.exits]),
    ["Ano", "Vínculos iniciados", "Vínculos encerrados"],
    ...data.growth.years.map(y => [y.label, y.newMemberships, y.exits]),
    ["Nota", data.notes.join(" ")],
  ];
  return "\uFEFF" + rows.map(row => row.map(escape).join(";")).join("\r\n");
}
export function makeLinePoints(values: number[], width = 660, height = 204) {
  const max = Math.max(1, ...values);
  const w = Math.max(1, width - 44), h = Math.max(1, height - 42);
  return values.map((value, index) => {
    const x = 22 + (values.length <= 1 ? w / 2 : index / (values.length - 1) * w);
    const y = 14 + h * (1 - value / max);
    return { x, y, value };
  });
}
