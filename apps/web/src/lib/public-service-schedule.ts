export const sundayServices = [
  { name: "Culto de domingo", day: "Domingo", weekday: 0, hour: 10, label: "10h", clock: "10:00", shift: "Manhã" },
  { name: "Culto de domingo", day: "Domingo", weekday: 0, hour: 19, label: "19h", clock: "19:00", shift: "Noite" },
] as const;

export const familyService = {
  name: "Culto da Família", day: "Quinta-feira", weekday: 4, hour: 20, label: "20h", clock: "20:00",
} as const;

const services = [...sundayServices, familyService];
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const localTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/Sao_Paulo", weekday: "short", hour: "numeric", hourCycle: "h23",
});

export function nextPublicService(now: Date) {
  const parts = localTime.formatToParts(now);
  const weekday = weekdays.indexOf(parts.find(part => part.type === "weekday")?.value ?? "");
  const hour = Number(parts.find(part => part.type === "hour")?.value);
  let next: (typeof services)[number] = sundayServices[0];
  let best = Infinity;

  for (const service of services) {
    const days = (service.weekday - weekday + 7) % 7;
    const distance = (days === 0 && hour >= service.hour ? 7 : days) * 24 + service.hour - hour;
    if (distance < best) {
      best = distance;
      next = service;
    }
  }
  return next;
}
