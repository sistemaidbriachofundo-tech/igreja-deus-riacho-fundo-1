const formatters = new Map<string, Intl.DateTimeFormat>();

/** Preferir calendário civil IANA ao offset fixo -03 (possíveis alterações de fuso futuras). */
export function localParts(iso: string, timeZone: string) {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) throw new Error('serviceAt inválido');
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
    });
    formatters.set(timeZone, formatter);
  }
  const parts = formatter.formatToParts(instant);
  const obj = Object.fromEntries(parts.map(p => [p.type, p.value]));
  const weekday = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(obj.weekday);
  if (weekday < 0) throw new Error('weekday inválido');
  const date = `${obj.year}-${obj.month}-${obj.day}`;
  return {date, month: `${obj.year}-${obj.month}`, dayOfMonth: Number(obj.day),
    weekday, minuteOfDay: Number(obj.hour)*60 + Number(obj.minute)};
}
export function localDayDifference(iso1: string, iso2: string, timeZone: string): number {
  const key = (v: string) => Date.parse(`${localParts(v,timeZone).date}T00:00:00.000Z`);
  return Math.abs((key(iso1)-key(iso2)) / 86_400_000);
}
export function isActiveStatus(status: string) { return status === 'PENDING' || status === 'CONFIRMED'; }
export function isMorning(minute: number) { return minute < 12*60; }
export function belongsToWindow(minute: number, weekday: number, windows: readonly {weekday:number;startMinute:number;endMinute:number}[]) {
  // A janela é half-open [start, end), restrita ao próprio dia.
  return windows.some(w => w.weekday === weekday && Number.isInteger(w.startMinute) &&
    Number.isInteger(w.endMinute) && w.startMinute >= 0 && w.endMinute <= 1440 &&
    w.startMinute < w.endMinute && minute >= w.startMinute && minute < w.endMinute);
}
