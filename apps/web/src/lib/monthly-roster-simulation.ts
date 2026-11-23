import { ApiRequestError, apiGet, apiPost } from "./api";
import { churchDayKey } from "./serving-rosters";

export type MonthlyChoice = {
  personId: string;
  personName: string;
  partnerPersonId?: string | null;
  partnerName?: string | null;
};
export type MonthlyPosition = Partial<MonthlyChoice> & {
  slotId: string;
  roleLabel: string;
  reasons?: string[];
  openVacancy?: string;
  requiresCouple?: boolean;
  locked?: boolean;
  readOnly?: boolean;
  candidates?: MonthlyChoice[];
};
export type MonthlyCapacity = { id: string; label: string; count: number; minimumCount: number };
export const MONTHLY_CAPACITY_MAX = 30;
/** Sorteios envolvem múltiplos cultos e a API QA pode precisar de mais de oito segundos. */
export const MONTHLY_ROSTER_TIMEOUT_MS = 60_000;
export type MonthlyRoster = {
  id: string;
  moduleId?: string;
  moduleName?: string;
  title: string;
  serviceAt: string;
  status?: string;
  readOnly?: boolean;
  capacity?: MonthlyCapacity[];
  positions: MonthlyPosition[];
};
export type MonthlyPreview = {
  month: string;
  revision?: string;
  responses?: number;
  members?: number;
  rosters: MonthlyRoster[];
};
export type MonthlyDecision = { slotId: string; personId: string | null; partnerPersonId?: string; locked: boolean };
export type MonthlyDraftChoice = { choice: MonthlyChoice | null; locked: boolean };
export type MonthlyRequest = {
  month: string;
  moduleId?: string;
  revision?: string;
  decisions?: MonthlyDecision[];
  capacities?: { rosterId: string; groupId: string; count: number }[];
  fillOnlyOpen?: boolean;
};

function endpoint(ministryId: string) {
  return `/rosters/by-ministry/${encodeURIComponent(ministryId)}`;
}

export function nextRosterMonth(now = new Date()) {
  const [year, month] = churchDayKey(now.toISOString()).slice(0, 7).split("-").map(Number);
  return new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 7);
}

export function rosterEditable(roster: MonthlyRoster) {
  return !roster.readOnly && (!roster.status || roster.status === "DRAFT" || roster.status === "MISSING");
}

export function monthlyChoiceKey(choice: MonthlyChoice) {
  return JSON.stringify([choice.personId, choice.partnerPersonId ?? null]);
}

export function monthlySlotChoice(position: MonthlyPosition, edits: Readonly<Record<string, MonthlyDraftChoice>>) {
  const saved = edits[position.slotId];
  if (saved) return saved;
  const { personId, personName, partnerPersonId, partnerName, locked } = position;
  const choice = personId && personName ? { personId, personName, partnerPersonId, partnerName } : null;
  return { choice, locked: Boolean(locked && choice) };
}

export function monthlyDecisions(preview: MonthlyPreview, edits: Readonly<Record<string, MonthlyDraftChoice>>): MonthlyDecision[] {
  return preview.rosters.filter(rosterEditable).flatMap(roster =>
    roster.positions.filter(position => !position.readOnly).map(position => {
      const { choice, locked } = monthlySlotChoice(position, edits);
      return {
        slotId: position.slotId,
        personId: choice?.personId ?? null,
        ...(choice?.partnerPersonId ? { partnerPersonId: choice.partnerPersonId } : {}),
        locked: Boolean(choice && locked),
      };
    }),
  );
}

export async function simulateRosterMonth(ministryId: string, token: string, input: MonthlyRequest, allowLegacy = false) {
  const base = endpoint(ministryId);
  let preview: MonthlyPreview;
  try {
    preview = await apiPost<MonthlyPreview>(base + "/monthly-simulation", token, input, { timeoutMs: MONTHLY_ROSTER_TIMEOUT_MS });
    if (!preview?.revision) throw new Error("A API devolveu uma simulação sem revisão. Atualize a página e tente novamente.");
  } catch (error) {
    if (!allowLegacy || !(error instanceof ApiRequestError) || (error.status !== 404 && error.status !== 405)) throw error;
    preview = await apiGet<MonthlyPreview>(base + "/monthly-preview/" + encodeURIComponent(input.month), token);
  }
  if (preview?.month !== input.month || !Array.isArray(preview.rosters)) {
    throw new Error("A API não devolveu a simulação para o mês escolhido.");
  }
  return preview;
}

export function saveRosterMonth(ministryId: string, token: string, input: MonthlyRequest & { revision: string }) {
  return apiPost<{ savedRosters: number }>(endpoint(ministryId) + "/monthly-simulation/save", token, input, { timeoutMs: MONTHLY_ROSTER_TIMEOUT_MS });
}

const explanations: Record<string, string> = {
  EMPTY_TEAM: "Equipe sem integrantes ativos",
  MONTHLY_UNANSWERED: "Disponibilidade do mês ainda não informada",
  MONTHLY_NOT_AVAILABLE: "Indisponibilidade informada para este culto",
  NO_AVAILABILITY: "Fora do horário disponível",
  ROLE_NOT_APPROVED: "Falta integrante habilitado",
  POSITION_NOT_QUALIFIED: "Falta integrante habilitado",
  DAY_CONFLICT: "Pessoa já escalada neste dia",
  FAMILY_DAY_CONFLICT: "Conflito de horário com a família",
  COUPLE_REQUIRED: "Falta casal cadastrado e disponível",
  COUPLE_NOT_ELIGIBLE: "Um integrante do casal está indisponível ou inabilitado",
  MIN_INTERVAL: "Intervalo mínimo entre escalas",
  MONTHLY_LIMIT: "Limite mensal",
  IMPEDIMENT: "Impedimento no horário",
  MORNING_ONLY: "Disponível somente pela manhã",
  EVENING_ONLY: "Disponível somente à noite",
  FIRST_SUNDAY_ONLY: "Disponível somente no primeiro domingo",
  ROTATION_LIMIT: "Limite de rodízio desta função",
};

export function monthlyVacancyMessage(position: MonthlyPosition) {
  const reasons = [...new Set((position.reasons ?? []).map(reason => explanations[reason]).filter(Boolean))];
  return reasons.length ? reasons.join(" · ") : position.openVacancy || "Vaga em aberto";
}
