/** Data civil no fuso de Brasília para proteção de cadastros de menores. */
export function personUnder18(birthDate: string, now = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return false;
  const [year,month,day] = birthDate.split("-").map(Number);
  const calendar = new Date(birthDate + "T00:00:00.000Z");
  if (!Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0,10) !== birthDate) return false;
  const reference = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit",
  }).formatToParts(now);
  const get = (key: string) => Number(reference.find(x=>x.type===key)?.value??0);
  return get("year") - year - (get("month") < month || (get("month") === month && get("day") < day) ? 1 : 0) < 18;
}
