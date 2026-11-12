/** O banco RF1 armazena janelas semanais em UTC; o domínio usa o calendário local. */
export interface UtcWindow { weekday: number; startMinute: number; endMinute: number }
export interface LocalWindow { weekday: number; startMinute: number; endMinute: number }

/** Conversão de offsets em minutos; RF1 atualmente observa America/Sao_Paulo UTC-03:00.
 * Não usar esta função em igrejas com horário de verão sem implementar IANA por data.
 * Intervalos que atravessam a meia-noite local são divididos, não descartados.
 */
export function utcWeeklyWindowsToRiachoLocal(windows: readonly UtcWindow[]): LocalWindow[] {
  const WEEK = 7 * 1440;
  const offset = 180;
  const result: LocalWindow[] = [];
  for (const window of windows) {
    if (!Number.isInteger(window.weekday) || window.weekday < 0 || window.weekday > 6 ||
        !Number.isInteger(window.startMinute) || !Number.isInteger(window.endMinute) ||
        window.startMinute < 0 || window.endMinute > 1440 || window.startMinute >= window.endMinute) {
      throw new Error('INVALID_UTC_AVAILABILITY_WINDOW');
    }
    let absoluteStart = window.weekday * 1440 + window.startMinute - offset;
    let remaining = window.endMinute - window.startMinute;
    while (remaining > 0) {
      const wrapped = ((absoluteStart % WEEK) + WEEK) % WEEK;
      const minute = wrapped % 1440;
      const duration = Math.min(remaining, 1440 - minute);
      result.push({ weekday: Math.floor(wrapped / 1440), startMinute: minute, endMinute: minute + duration });
      absoluteStart += duration;
      remaining -= duration;
    }
  }
  return result;
}
