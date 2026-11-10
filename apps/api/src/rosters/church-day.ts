/** Fuso da congregação piloto. O Brasil não observa horário de verão desde 2019. */
export const CHURCH_TIME_ZONE = "America/Sao_Paulo";
const CHURCH_UTC_OFFSET = "-03:00";

/** Dia civil em America/Sao_Paulo, no formato YYYY-MM-DD. */
export function churchDayKey(instant: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CHURCH_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** Intervalo [início, fim) do dia civil da congregação que contém o instante. */
export function churchDayBounds(instant: Date): { start: Date; end: Date } {
  const key = churchDayKey(instant);
  const start = new Date(`${key}T00:00:00.000${CHURCH_UTC_OFFSET}`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}
