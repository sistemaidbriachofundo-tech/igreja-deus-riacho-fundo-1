/**
 * Prévia determinística da ordem de culto.
 * Não grava, não inventa voluntário e não lê nomes fixos de liderança.
 * America/Sao_Paulo é resolvido pelo fuso civil, independente do fuso do processo.
 */

export const SERVICE_ORDER_TIME_ZONE = "America/Sao_Paulo";
export const UNDEFINED_RESPONSIBLE = "A definir";

export interface ServiceOrderSlotRule {
  weekday: number;
  time: string;
  title: string;
}

export interface ServiceOrderRoleRule {
  key: string;
  title: string;
  minutes: number;
  source: "pool" | "roster" | "fixed";
  rosterRoleLabels?: string[];
  fixedLabel?: string;
}

export interface ServiceOrderPolicyConfig {
  minGapDays: number;
  monthlyLimitPerPerson: number;
  avoidDualDirectionAndPreaching: boolean;
  skipUnavailable: boolean;
  blessingRoleKey: string;
  directionRoleKey: string;
  preachingRoleKey: string;
  slots: ServiceOrderSlotRule[];
  roles: ServiceOrderRoleRule[];
  pools: Record<string, string[]>;
}

export interface PlannerHistoryEntry {
  personId: string;
  roleKey: string;
  serviceAt: string;
}

export interface PlannerRosterCandidate {
  personId: string;
  displayName: string;
  roleLabel: string;
  status: "CONFIRMED" | "PENDING" | "DECLINED" | "SUBSTITUTED";
}

export interface PlannerImpediment {
  personId: string;
  startsAt: string;
  endsAt: string;
}

export interface PlannerException {
  serviceAt: string;
  kind: "SKIP" | "SPECIAL";
  title?: string | null;
  note: string;
}

export interface PlannerRoster {
  serviceAt: string;
  status: "PUBLISHED" | "DRAFT" | "CLOSED";
  slots: PlannerRosterCandidate[];
}

export interface PlannerSong {
  serviceAt: string;
  title: string;
  musicalKey: string;
}

export interface PlannerInput {
  year: number;
  month: number;
  policy?: Partial<ServiceOrderPolicyConfig> | null;
  history?: PlannerHistoryEntry[];
  rosters?: PlannerRoster[];
  impediments?: PlannerImpediment[];
  exceptions?: PlannerException[];
  songs?: PlannerSong[];
  /** Pessoas conhecidas pelos IDs do pool. Nome ausente não cria voluntário. */
  people?: Array<{ personId: string; displayName: string }>;
  existingServiceAt?: string[];
  /** Ordens já gravadas neste mês. Entram na contagem uma vez e não são sorteadas de novo. */
  locked?: Array<{ serviceAt: string; title: string; kind: "REGULAR" | "SPECIAL"; note: string | null; items: PlannedItem[] }>;
}

export interface PlannedItem {
  position: number;
  roleKey: string;
  title: string;
  minutes: number;
  responsible: string | null;
  responsiblePersonId: string | null;
  equipment: string | null;
  notes: string | null;
  alert: string | null;
  startsAt: string;
}

export interface PlannedService {
  serviceAt: string;
  title: string;
  kind: "REGULAR" | "SPECIAL";
  note: string | null;
  items: PlannedItem[];
  alerts: string[];
  existing: boolean;
}

export interface ServiceOrderPlan {
  month: string;
  timeZone: typeof SERVICE_ORDER_TIME_ZONE;
  services: PlannedService[];
  alerts: string[];
}

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export const DEFAULT_SERVICE_ORDER_POLICY: ServiceOrderPolicyConfig = {
  minGapDays: 14,
  monthlyLimitPerPerson: 2,
  avoidDualDirectionAndPreaching: true,
  skipUnavailable: true,
  blessingRoleKey: "bencao",
  directionRoleKey: "direcao",
  preachingRoleKey: "pregacao",
  slots: [
    { weekday: 4, time: "20:00", title: "Culto de quinta" },
    { weekday: 0, time: "10:00", title: "Culto de domingo — manhã" },
    { weekday: 0, time: "19:00", title: "Culto de domingo — noite" },
  ],
  roles: [
    { key: "abertura", title: "Abertura", minutes: 5, source: "fixed", fixedLabel: "Recepção" },
    { key: "louvor", title: "Louvor", minutes: 25, source: "roster", rosterRoleLabels: ["Louvor", "Ministro de louvor"] },
    { key: "direcao", title: "Direção do culto", minutes: 10, source: "pool" },
    { key: "ofertas", title: "Ofertas", minutes: 8, source: "roster", rosterRoleLabels: ["Ofertas", "Maquininhas"] },
    { key: "pregacao", title: "Pregação", minutes: 35, source: "pool" },
    { key: "bencao", title: "Bênção", minutes: 5, source: "pool" },
    { key: "encerramento", title: "Encerramento", minutes: 5, source: "fixed", fixedLabel: "Equipe do culto" },
  ],
  pools: {},
};

export function normalizeServiceOrderPolicy(input?: Partial<ServiceOrderPolicyConfig> | null): ServiceOrderPolicyConfig {
  const source = input ?? {};
  const slots = Array.isArray(source.slots) && source.slots.length > 0
    ? source.slots.map((slot) => ({
      weekday: clampInt(slot.weekday, 0, 6, 0),
      time: /^\d{2}:\d{2}$/.test(slot.time ?? "") ? slot.time : "10:00",
      title: clean(slot.title, 120) || "Culto",
    }))
    : DEFAULT_SERVICE_ORDER_POLICY.slots.map((slot) => ({ ...slot }));
  const roles = Array.isArray(source.roles) && source.roles.length > 0
    ? source.roles.map((role) => ({
      key: cleanKey(role.key) || "etapa",
      title: clean(role.title, 120) || "Etapa",
      minutes: clampInt(role.minutes, 1, 180, 5),
      source: role.source === "roster" || role.source === "fixed" || role.source === "pool" ? role.source : "pool",
      ...(role.rosterRoleLabels ? { rosterRoleLabels: role.rosterRoleLabels.map((label) => clean(label, 80)).filter(Boolean) } : {}),
      ...(role.fixedLabel ? { fixedLabel: clean(role.fixedLabel, 80) } : {}),
    }))
    : DEFAULT_SERVICE_ORDER_POLICY.roles.map((role) => ({ ...role }));
  const roleKeys = new Set(roles.map((role) => role.key));
  const pools: Record<string, string[]> = {};
  for (const [key, ids] of Object.entries(source.pools ?? {})) {
    if (!roleKeys.has(key) || !Array.isArray(ids)) continue;
    pools[key] = [...new Set(ids.map((id) => cleanId(id)).filter((id): id is string => Boolean(id)))].slice(0, 40);
  }
  const blessing = roleKeys.has(source.blessingRoleKey ?? "") ? source.blessingRoleKey! : (roleKeys.has("bencao") ? "bencao" : roles[0]?.key ?? "bencao");
  const direction = roleKeys.has(source.directionRoleKey ?? "") ? source.directionRoleKey! : (roleKeys.has("direcao") ? "direcao" : blessing);
  const preaching = roleKeys.has(source.preachingRoleKey ?? "") ? source.preachingRoleKey! : (roleKeys.has("pregacao") ? "pregacao" : blessing);
  return {
    minGapDays: clampInt(source.minGapDays, 0, 90, DEFAULT_SERVICE_ORDER_POLICY.minGapDays),
    monthlyLimitPerPerson: clampInt(source.monthlyLimitPerPerson, 1, 31, DEFAULT_SERVICE_ORDER_POLICY.monthlyLimitPerPerson),
    avoidDualDirectionAndPreaching: source.avoidDualDirectionAndPreaching !== false,
    skipUnavailable: source.skipUnavailable !== false,
    blessingRoleKey: blessing,
    directionRoleKey: direction,
    preachingRoleKey: preaching,
    slots,
    roles,
    pools,
  };
}

/** Empate estável que muda com o culto e a função. Não ordena pelo identificador. */
export function rotationTieBreak(serviceAt: string, roleKey: string, personId: string): number {
  const text = `${serviceAt}|${roleKey}|${personId}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone = SERVICE_ORDER_TIME_ZONE): Date {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const parts = civilParts(utcGuess, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return new Date(utcGuess.getTime() - (asUtc - utcGuess.getTime()));
}

export function instantMonth(serviceAt: string, timeZone = SERVICE_ORDER_TIME_ZONE): { year: number; month: number } {
  const parts = civilParts(new Date(serviceAt), timeZone);
  return { year: parts.year, month: parts.month };
}

export function weekdayInTimeZone(year: number, month: number, day: number, timeZone = SERVICE_ORDER_TIME_ZONE): number {
  const noon = zonedTimeToUtc(year, month, day, 12, 0, timeZone);
  const label = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(noon);
  const index = WEEKDAY.indexOf(label as (typeof WEEKDAY)[number]);
  if (index < 0) throw new Error(`Dia da semana indisponível em ${timeZone}`);
  return index;
}

export function planServiceOrders(input: PlannerInput): ServiceOrderPlan {
  const policy = normalizeServiceOrderPolicy(input.policy);
  const month = `${input.year}-${String(input.month).padStart(2, "0")}`;
  const history = (input.history ?? []).filter((entry) => cleanId(entry.personId) && entry.serviceAt);
  const existing = new Set(input.existingServiceAt ?? []);
  const people = new Map((input.people ?? []).map((person) => [person.personId, person.displayName.trim()]));
  const alerts: string[] = [];
  const services: PlannedService[] = [];
  const assigned = history.map((entry) => ({ ...entry }));

  for (const occurrence of monthOccurrences(input.year, input.month, policy.slots)) {
    const locked = (input.locked ?? []).find((item) => sameInstant(item.serviceAt, occurrence.serviceAt));
    if (locked) {
      let cursor = new Date(occurrence.serviceAt).getTime();
      const items = locked.items.map((item) => {
        const startsAt = new Date(cursor).toISOString();
        cursor += item.minutes * 60_000;
        if (item.responsiblePersonId) assigned.push({ personId: item.responsiblePersonId, roleKey: item.roleKey, serviceAt: occurrence.serviceAt });
        return { ...item, startsAt };
      });
      services.push({ ...locked, items, alerts: items.flatMap((item) => item.alert ? [item.alert] : []), existing: true });
      continue;
    }
    const exception = (input.exceptions ?? []).find((item) => sameInstant(item.serviceAt, occurrence.serviceAt));
    if (exception?.kind === "SKIP") {
      alerts.push(`${formatLocal(occurrence.serviceAt)} ficou de fora por exceção registrada: ${exception.note}`);
      continue;
    }
    const title = exception?.kind === "SPECIAL" && clean(exception.title, 120) ? clean(exception.title, 120) : occurrence.title;
    const items: PlannedItem[] = [];
    const serviceAlerts: string[] = [];
    let cursor = new Date(occurrence.serviceAt).getTime();
    const taken = new Set<string>();
    policy.roles.forEach((role, position) => {
      const choice = choosePerson({
        policy, role, serviceAt: occurrence.serviceAt, month, history: assigned, taken,
        roster: publishedRoster(input.rosters ?? [], occurrence.serviceAt),
        impediments: input.impediments ?? [],
        people,
      });
      const startsAt = new Date(cursor).toISOString();
      cursor += role.minutes * 60_000;
      const notes = role.key === "louvor" ? songNote(input.songs ?? [], occurrence.serviceAt) : null;
      items.push({
        position,
        roleKey: role.key,
        title: role.title,
        minutes: role.minutes,
        responsible: choice.displayName,
        responsiblePersonId: choice.personId,
        equipment: null,
        notes,
        alert: choice.alert,
        startsAt,
      });
      if (choice.alert) serviceAlerts.push(choice.alert);
      if (choice.personId) {
        taken.add(`${role.key}:${choice.personId}`);
        assigned.push({ personId: choice.personId, roleKey: role.key, serviceAt: occurrence.serviceAt });
      }
    });
    if (exception?.kind === "SPECIAL") serviceAlerts.push(`Culto especial registrado: ${exception.note}`);
    services.push({
      serviceAt: occurrence.serviceAt,
      title,
      kind: exception?.kind === "SPECIAL" ? "SPECIAL" : "REGULAR",
      note: exception?.kind === "SPECIAL" ? exception.note : null,
      items,
      alerts: serviceAlerts,
      existing: existing.has(occurrence.serviceAt),
    });
  }

  return { month, timeZone: SERVICE_ORDER_TIME_ZONE, services, alerts };
}

/** Só o impedimento com início e fim absolutos bloqueia. Janela recorrente ausente não entra aqui. */
export function impedimentCovers(impediments: PlannerImpediment[], personId: string, serviceAt: string): boolean {
  const instant = new Date(serviceAt).getTime();
  return impediments.some((item) => item.personId === personId
    && new Date(item.startsAt).getTime() <= instant
    && new Date(item.endsAt).getTime() > instant);
}

function choosePerson(args: {
  policy: ServiceOrderPolicyConfig;
  role: ServiceOrderRoleRule;
  serviceAt: string;
  month: string;
  history: PlannerHistoryEntry[];
  taken: Set<string>;
  roster: PlannerRosterCandidate[];
  impediments: PlannerImpediment[];
  people: Map<string, string>;
}): { personId: string | null; displayName: string | null; alert: string | null } {
  const { policy, role, serviceAt } = args;
  if (role.source === "fixed") return { personId: null, displayName: role.fixedLabel ?? null, alert: null };
  const candidates = role.source === "roster"
    ? rosterCandidates(args.roster, role)
    : poolCandidates(policy.pools[role.key] ?? [], args.people);
  if (candidates.length === 0) {
    return { personId: null, displayName: null, alert: `${role.title}: ${UNDEFINED_RESPONSIBLE}. Nenhuma pessoa confirmada e elegível.` };
  }
  const ranked = candidates
    .map((candidate) => ({ ...candidate, blocked: blockReason(args, candidate.personId) }))
    .filter((candidate) => !candidate.blocked)
    .sort((left, right) => rankStatus(left.status) - rankStatus(right.status)
      || compareCandidates(left.personId, right.personId, role.key, serviceAt, args.history));
  const blocked = candidates.map((candidate) => blockReason(args, candidate.personId)).filter(Boolean);
  const winner = ranked[0];
  if (!winner) {
    return {
      personId: null,
      displayName: null,
      alert: `${role.title}: ${UNDEFINED_RESPONSIBLE}. ${blocked[0] ?? "Nenhuma pessoa passou nas regras."}`,
    };
  }
  const pending = winner.status === "PENDING" ? " A escala ainda aguarda confirmação." : "";
  return {
    personId: winner.personId,
    displayName: winner.displayName,
    alert: pending ? `${role.title}: pessoa elegível ainda não confirmada.${pending}` : null,
  };
}

function blockReason(args: {
  policy: ServiceOrderPolicyConfig;
  role: ServiceOrderRoleRule;
  serviceAt: string;
  month: string;
  history: PlannerHistoryEntry[];
  taken: Set<string>;
  impediments: PlannerImpediment[];
}, personId: string): string | null {
  const { policy, role, serviceAt, month } = args;
  if ([...args.taken].some((entry) => entry.endsWith(`:${personId}`) && entry.startsWith(`${role.key}:`))) {
    return "Já escalado nesta função neste culto.";
  }
  if (policy.avoidDualDirectionAndPreaching && (role.key === policy.directionRoleKey || role.key === policy.preachingRoleKey)) {
    const other = role.key === policy.directionRoleKey ? policy.preachingRoleKey : policy.directionRoleKey;
    if (args.taken.has(`${other}:${personId}`)) return "A mesma pessoa não acumula direção e pregação neste culto.";
  }
  if (policy.skipUnavailable && impedimentCovers(args.impediments, personId, serviceAt)) {
    return "Indisponibilidade registrada neste horário.";
  }
  const monthCount = args.history.filter((entry) => entry.personId === personId && monthKey(entry.serviceAt) === month).length;
  if (monthCount >= policy.monthlyLimitPerPerson) return "Limite do mês já atingido.";
  const last = lastAssignment(args.history, personId);
  if (last && policy.minGapDays > 0) {
    const gap = (new Date(serviceAt).getTime() - new Date(last).getTime()) / 86_400_000;
    if (gap < policy.minGapDays) return `Intervalo mínimo de ${policy.minGapDays} dias ainda não cumprido.`;
  }
  return null;
}

function compareCandidates(left: string, right: string, roleKey: string, serviceAt: string, history: PlannerHistoryEntry[]): number {
  const countDelta = countAll(history, left) - countAll(history, right);
  if (countDelta !== 0) return countDelta;
  const lastDelta = stamp(lastAssignment(history, left)) - stamp(lastAssignment(history, right));
  if (lastDelta !== 0) return lastDelta;
  return rotationTieBreak(serviceAt, roleKey, left) - rotationTieBreak(serviceAt, roleKey, right);
}

function rosterCandidates(roster: PlannerRosterCandidate[], role: ServiceOrderRoleRule) {
  const labels = new Set((role.rosterRoleLabels ?? [role.title]).map((label) => label.toLocaleLowerCase("pt-BR")));
  const byPerson = new Map<string, { personId: string; displayName: string; status: PlannerRosterCandidate["status"] }>();
  for (const candidate of roster) {
    if (candidate.status === "DECLINED" || candidate.status === "SUBSTITUTED") continue;
    if (!labels.has(candidate.roleLabel.toLocaleLowerCase("pt-BR"))) continue;
    const displayName = candidate.displayName.trim();
    if (!candidate.personId || !displayName) continue;
    const current = byPerson.get(candidate.personId);
    if (!current || rankStatus(candidate.status) < rankStatus(current.status)) {
      byPerson.set(candidate.personId, { personId: candidate.personId, displayName, status: candidate.status });
    }
  }
  return [...byPerson.values()];
}

function poolCandidates(ids: string[], people: Map<string, string>) {
  return ids
    .map((personId) => ({ personId, displayName: people.get(personId)?.trim() ?? "", status: "CONFIRMED" as const }))
    .filter((candidate) => candidate.displayName);
}

function publishedRoster(rosters: PlannerRoster[], serviceAt: string): PlannerRosterCandidate[] {
  return rosters
    .filter((roster) => roster.status === "PUBLISHED" && sameInstant(roster.serviceAt, serviceAt))
    .flatMap((roster) => roster.slots);
}

function songNote(songs: PlannerSong[], serviceAt: string): string | null {
  const titles = songs.filter((song) => sameInstant(song.serviceAt, serviceAt)).map((song) => `${song.title} (${song.musicalKey})`);
  return titles.length ? `Repertório do culto: ${titles.join("; ")}` : null;
}

function monthOccurrences(year: number, month: number, slots: ServiceOrderSlotRule[]) {
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const found: Array<{ serviceAt: string; title: string }> = [];
  for (let day = 1; day <= days; day += 1) {
    const weekday = weekdayInTimeZone(year, month, day);
    for (const slot of slots) {
      if (slot.weekday !== weekday) continue;
      const [hour, minute] = slot.time.split(":").map((part) => Number(part));
      found.push({ serviceAt: zonedTimeToUtc(year, month, day, hour, minute).toISOString(), title: slot.title });
    }
  }
  return found.sort((left, right) => left.serviceAt.localeCompare(right.serviceAt) || left.title.localeCompare(right.title));
}

function countAll(history: PlannerHistoryEntry[], personId: string) {
  return history.filter((entry) => entry.personId === personId).length;
}

function lastAssignment(history: PlannerHistoryEntry[], personId: string) {
  return history.filter((entry) => entry.personId === personId).map((entry) => entry.serviceAt).sort().at(-1) ?? null;
}

function stamp(value: string | null) {
  return value ? new Date(value).getTime() : 0;
}

function rankStatus(status: string) {
  return status === "CONFIRMED" ? 0 : 1;
}

function monthKey(serviceAt: string) {
  const parts = civilParts(new Date(serviceAt), SERVICE_ORDER_TIME_ZONE);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}`;
}

function sameInstant(left: string, right: string) {
  return new Date(left).getTime() === new Date(right).getTime();
}

function formatLocal(serviceAt: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: SERVICE_ORDER_TIME_ZONE, dateStyle: "short", timeStyle: "short" }).format(new Date(serviceAt));
}

function civilParts(date: Date, timeZone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
    hour: Number(parts.hour), minute: Number(parts.minute), second: Number(parts.second),
  };
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const number = typeof value === "number" ? value : Number.NaN;
  if (!Number.isInteger(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanKey(value: unknown) {
  const text = clean(value, 40).toLocaleLowerCase("pt-BR");
  return /^[a-z0-9_-]+$/.test(text) ? text : "";
}

function cleanId(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return /^[A-Za-z0-9_-]{1,80}$/.test(text) ? text : null;
}
