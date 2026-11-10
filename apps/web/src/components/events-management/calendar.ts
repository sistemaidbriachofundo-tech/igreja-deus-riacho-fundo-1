export type AgendaItem = {
  id: string;
  name: string;
  status: string;
  startsAt: string;
};

export type CalendarCell = {
  date: string;
  day: number;
  inMonth: boolean;
  events: AgendaItem[];
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Rascunho",
  PUBLISHED: "Publicado",
  CANCELLED: "Cancelado",
  ARCHIVED: "Arquivado",
  CONFIRMED: "Confirmada",
  CHECKED_IN: "Com presença",
  PENDING_PAYMENT: "Pagamento pendente",
};

export const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

const pad = (value: number) => String(value).padStart(2, "0");

export function eventStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? (status ? "Situação registrada" : "Sem situação");
}

export function dayKeyFromDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function eventDayKey(iso: string): string | null {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return null;
  return dayKeyFromDate(date);
}

export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

export function parseMonthKey(key: string): Date {
  const [year, month] = key.split("-").map((part) => Number(part));
  const safeYear = Number.isInteger(year) ? year : new Date().getFullYear();
  const safeMonth = Number.isInteger(month) && month >= 1 && month <= 12 ? month : 1;
  return new Date(safeYear, safeMonth - 1, 1);
}

export function shiftMonth(key: string, delta: number): string {
  const date = parseMonthKey(key);
  return monthKey(new Date(date.getFullYear(), date.getMonth() + delta, 1));
}

export function monthTitle(key: string): string {
  const label = parseMonthKey(key).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return label.charAt(0).toLocaleUpperCase("pt-BR") + label.slice(1);
}

export function formatAgendaWhen(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "Data a confirmar";
  return date.toLocaleString("pt-BR", { dateStyle: "medium", timeStyle: "short" });
}

export function initialMonth(events: readonly AgendaItem[], today = new Date()): string {
  const dated = events
    .map((event) => eventDayKey(event.startsAt))
    .filter((day): day is string => Boolean(day))
    .sort();
  return dated[0]?.slice(0, 7) ?? monthKey(today);
}

export function filterAgenda<T extends AgendaItem>(
  events: readonly T[],
  filters: { query?: string; status?: string; month?: string },
): T[] {
  const query = filters.query?.trim().toLocaleLowerCase("pt-BR") ?? "";
  return events.filter((event) => {
    if (filters.status && event.status !== filters.status) return false;
    if (filters.month) {
      const day = eventDayKey(event.startsAt);
      if (!day?.startsWith(filters.month)) return false;
    }
    if (query && !event.name.toLocaleLowerCase("pt-BR").includes(query)) return false;
    return true;
  });
}

export function buildMonthGrid(month: string, events: readonly AgendaItem[]): CalendarCell[] {
  const start = parseMonthKey(month);
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1 - start.getDay());
  const byDay = new Map<string, AgendaItem[]>();
  for (const event of events) {
    const key = eventDayKey(event.startsAt);
    if (!key) continue;
    const list = byDay.get(key) ?? [];
    list.push(event);
    byDay.set(key, list);
  }
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + index);
    const key = dayKeyFromDate(date);
    return {
      date: key,
      day: date.getDate(),
      inMonth: date.getMonth() === start.getMonth(),
      events: byDay.get(key) ?? [],
    };
  });
}
