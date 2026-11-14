export const sundayServices = [
  { shift: "Manhã", hour: 10, label: "10h", clock: "10:00" },
  { shift: "Noite", hour: 19, label: "19h", clock: "19:00" },
] as const;

const localTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/Sao_Paulo", weekday: "short", hour: "numeric", hourCycle: "h23",
});

export function nextSundayService(now: Date) {
  const parts = localTime.formatToParts(now);
  const weekday = parts.find(part => part.type === "weekday")?.value;
  const hour = Number(parts.find(part => part.type === "hour")?.value);
  return weekday === "Sun" ? sundayServices.find(service => service.hour > hour) ?? sundayServices[0] : sundayServices[0];
}
