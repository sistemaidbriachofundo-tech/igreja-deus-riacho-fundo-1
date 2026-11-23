import { BadRequestException } from "@nestjs/common";

export type BlessingChoice = "LEADERSHIP" | "PREACHER" | "DESIGNATED";
export type CultWindow = { weekday: number; time: string; title: string };
export type ServiceException = { serviceAt: string; kind: "SKIP" | "SPECIAL"; note: string; title?: string };
export type ServiceOrderRules = {
  services: CultWindow[];
  minIntervalDays: number;
  maxMonthlyAssignments: number;
  avoidDoubleDirectorPreacher: boolean;
  respectAvailability: boolean;
  requireConfirmedRoster: boolean;
  blessing: BlessingChoice;
  exceptions: ServiceException[];
};
export type SuggestedMoment = { title: string; minutes: number; responsible: string | null; responsiblePersonId: string | null; microphone?: string | null; equipment?: string | null; notes?: string | null };
export type Candidate = { personId: string; displayName: string; roleLabel: string; rosterId: string; status: "PENDING" | "CONFIRMED" };
export type ServingHistory = { personId: string; serviceAt: string; role: string };

export const RF1_SERVICE_ORDER_DEFAULTS: ServiceOrderRules = {
  services: [
    { weekday: 0, time: "10:00", title: "Culto de Domingo — manhã" },
    { weekday: 0, time: "19:00", title: "Culto de Domingo — noite" },
    { weekday: 4, time: "20:00", title: "Culto da Família" },
  ],
  minIntervalDays: 14,
  maxMonthlyAssignments: 2,
  avoidDoubleDirectorPreacher: true,
  respectAvailability: true,
  requireConfirmedRoster: true,
  blessing: "LEADERSHIP",
  exceptions: [],
};

export function parseOrderRules(value: unknown): ServiceOrderRules {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new BadRequestException("Configuração de OC inválida.");
  const v = value as Record<string, unknown>;
  const bool = (key: keyof ServiceOrderRules) => {
    if (typeof v[key] !== "boolean") throw new BadRequestException("Regra " + key + " precisa ser verdadeira ou falsa.");
    return v[key] as boolean;
  };
  const int = (key: "minIntervalDays" | "maxMonthlyAssignments", min: number, max: number) => {
    const n = v[key];
    if (typeof n !== "number" || !Number.isInteger(n) || n < min || n > max) throw new BadRequestException("Regra " + key + " fora do limite.");
    return n;
  };
  if (!Array.isArray(v.services) || v.services.length < 1 || v.services.length > 15) {
    throw new BadRequestException("Cadastre de 1 a 15 horários regulares.");
  }
  const services = v.services.map((x: unknown) => {
    if (!x || typeof x !== "object" || Array.isArray(x)) throw new BadRequestException("Horário inválido.");
    const item = x as Record<string, unknown>;
    if (!Number.isInteger(item.weekday) || Number(item.weekday) < 0 || Number(item.weekday) > 6 ||
        typeof item.time !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(item.time) ||
        typeof item.title !== "string" || !item.title.trim() || item.title.length > 90) {
      throw new BadRequestException("Dia, horário ou título de culto inválido.");
    }
    return { weekday: Number(item.weekday), time: item.time, title: item.title.trim() };
  });
  if (new Set(services.map(x => x.weekday + "|" + x.time)).size !== services.length) {
    throw new BadRequestException("O mesmo dia e horário foi informado duas vezes.");
  }
  if (!["LEADERSHIP","PREACHER","DESIGNATED"].includes(String(v.blessing))) {
    throw new BadRequestException("Selecione como será definida a bênção apostólica.");
  }
  const exceptions = readExceptions(v.exceptions);
  return {
    services,
    minIntervalDays: int("minIntervalDays", 0, 90),
    maxMonthlyAssignments: int("maxMonthlyAssignments", 1, 15),
    avoidDoubleDirectorPreacher: bool("avoidDoubleDirectorPreacher"),
    respectAvailability: bool("respectAvailability"),
    requireConfirmedRoster: bool("requireConfirmedRoster"),
    blessing: v.blessing as BlessingChoice,
    exceptions,
  };
}

function readExceptions(value: unknown): ServiceException[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 40) throw new BadRequestException("As exceções precisam ser uma lista de até 40 cultos.");
  return value.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) throw new BadRequestException("Exceção de culto inválida.");
    const item = row as Record<string, unknown>;
    const serviceAt = typeof item.serviceAt === "string" ? item.serviceAt.trim() : "";
    const note = typeof item.note === "string" ? item.note.trim() : "";
    const title = typeof item.title === "string" ? item.title.trim() : "";
    if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{3})?Z)?)?$/.test(serviceAt) || !note || note.length > 280 || (item.kind !== "SKIP" && item.kind !== "SPECIAL")) {
      throw new BadRequestException("Cada exceção precisa de data, tipo e observação.");
    }
    if (/^(bispo|bispa|pastor|pastora)\s+\S+/i.test(note) || /^(bispo|bispa|pastor|pastora)\s+\S+/i.test(title)) {
      throw new BadRequestException("A exceção não fixa nome de bispo ou pastor.");
    }
    return { serviceAt, kind: item.kind, note, ...(title ? { title } : {}) };
  });
}

const TZ = "America/Sao_Paulo";
const fmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
function localFields(instant: number) {
  const p = Object.fromEntries(fmt.formatToParts(new Date(instant)).map(x => [x.type, x.value]));
  return { year: Number(p.year), month: Number(p.month), day: Number(p.day), hour: Number(p.hour), minute: Number(p.minute) };
}
/** Conversão pelo calendário civil IANA; não fixa UTC-3 ou depende do timezone do servidor. */
export function brasiliaInstant(year: number, month: number, day: number, time: string): string {
  const [hour, minute] = time.split(":").map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let instant = target;
  for (let i = 0; i < 4; i++) {
    const p = localFields(instant);
    const represented = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    instant += target - represented;
  }
  const check = localFields(instant);
  if (check.year !== year || check.month !== month || check.day !== day || check.hour !== hour || check.minute !== minute) {
    throw new BadRequestException("Horário local ambíguo ou inexistente; corrija a configuração do culto.");
  }
  return new Date(instant).toISOString();
}

export function monthServiceDates(year: number, month: number, rules: ServiceOrderRules) {
  if (!Number.isInteger(year) || year < 2025 || year > 2035 || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new BadRequestException("Ano ou mês inválido para gerar a Ordem de Culto.");
  }
  const n = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const rows: Array<{ serviceAt: string; title: string }> = [];
  for (let day = 1; day <= n; day++) {
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    for (const service of rules.services.filter(x => x.weekday === weekday)) {
      rows.push({ serviceAt: brasiliaInstant(year, month, day, service.time), title: service.title });
    }
  }
  return rows.sort((a,b)=>a.serviceAt.localeCompare(b.serviceAt));
}

export function localDateKey(serviceAt: string) {
  const parts = localFields(Date.parse(serviceAt));
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function exceptionFor(rules: ServiceOrderRules, serviceAt: string) {
  const date = localDateKey(serviceAt);
  const parts = localFields(Date.parse(serviceAt));
  const clock = `${date}T${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
  return rules.exceptions.find((item) => item.serviceAt === serviceAt || item.serviceAt === date || item.serviceAt === clock) ?? null;
}

export function localDayGap(first: string, second: string): number {
  const dateKey = (s: string) => {
    const p = localFields(Date.parse(s));
    return Date.UTC(p.year, p.month - 1, p.day);
  };
  return Math.abs((dateKey(first) - dateKey(second)) / 86400000);
}

function rankHash(input: string) {
  let state = 2166136261;
  for (const char of input) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  return state >>> 0;
}
export type RoleKey = "director" | "preacher" | "praise" | "welcome";
const ROLE_REGEX: Record<RoleKey, RegExp> = {
  director: /dire(?:ç|c|t|g)|dirig|conduzir/i,
  preacher: /prega|pastor|bispo|palavra/i,
  praise: /louvor|adora|ministro.*música|música/i,
  welcome: /acolh|recep|conexão|boas.vindas/i,
};
/**
 * Apenas candidatos efetivamente presentes nas escalas do culto; históricos identificados por pessoa.
 * Ordem de desempate varia com a data, evitando privilégio permanente ao menor ID.
 */
export function chooseRoleCandidate(
  role: RoleKey,
  serviceAt: string,
  candidates: readonly Candidate[],
  history: readonly ServingHistory[],
  chosen: ReadonlySet<string>,
  rules: ServiceOrderRules,
  isEligible: (personId: string, serviceAt: string, rosterId: string) => boolean,
): Candidate | null {
  const local = localFields(Date.parse(serviceAt));
  const monthKey = String(local.year) + "-" + String(local.month).padStart(2, "0");
  const matches = candidates.filter(row => ROLE_REGEX[role].test(row.roleLabel) &&
    (!rules.requireConfirmedRoster || row.status === "CONFIRMED") &&
    isEligible(row.personId, serviceAt, row.rosterId) &&
    !(rules.avoidDoubleDirectorPreacher && (role === "director" || role === "preacher") && chosen.has(row.personId)));
  const unique = [...new Map(matches.map(c => [c.personId,c])).values()];
  const ranked = unique.map(row => {
    const uses = history.filter(h => h.personId === row.personId && Date.parse(h.serviceAt) < Date.parse(serviceAt));
    const monthly = uses.filter(h => {
      const p = localFields(Date.parse(h.serviceAt));
      return String(p.year) + "-" + String(p.month).padStart(2, "0") === monthKey;
    });
    const last = uses.reduce((x,h)=>Math.max(x,Date.parse(h.serviceAt)),0);
    return { row, uses: uses.length, monthly: monthly.length, last };
  }).filter(x => x.monthly < rules.maxMonthlyAssignments &&
    (!x.last || localDayGap(new Date(x.last).toISOString(), serviceAt) >= rules.minIntervalDays));
  ranked.sort((a,b)=>(Number(b.row.status === "CONFIRMED")-Number(a.row.status === "CONFIRMED")) ||
    a.uses-b.uses || a.last-b.last ||
    rankHash(a.row.personId+"|"+serviceAt)-rankHash(b.row.personId+"|"+serviceAt));
  return ranked[0]?.row ?? null;
}

export function buildServiceMoments(
  director: Candidate | null, preacher: Candidate | null, praise: Candidate | null,
  welcome: Candidate | null, rules: ServiceOrderRules,
): SuggestedMoment[] {
  const m = (title:string, minutes:number, person:Candidate|null, fallback?:string, notes?:string):SuggestedMoment =>
    ({ title, minutes, responsible:person?.displayName??fallback??"A definir", responsiblePersonId:person?.personId??null, notes:notes??null });
  const blessing = rules.blessing === "PREACHER" ? preacher : null;
  return [
    m("Vídeo prelúdio",10,null,"Equipe de Mídia"),
    m("Louvor e adoração",25,praise,"Ministério de Louvor"),
    m("Momento de acolher",5,welcome??director),
    m("IDB News",3,null,"Equipe de Mídia"),
    m("Generosidade",5,director??welcome),
    m("Louvor durante a coleta",5,praise,"Ministério de Louvor"),
    m("Pregação e ministração",40,preacher),
    m("Oração pelas famílias / bênção apostólica",5,blessing,undefined,
      rules.blessing==="LEADERSHIP"?"Responsável definido pela liderança pastoral.":rules.blessing==="DESIGNATED"?"Escolha manualmente quem realizará a bênção.":undefined),
    m("Instrumental de despedida",5,praise,"Louvor / Backstage"),
  ];
}
