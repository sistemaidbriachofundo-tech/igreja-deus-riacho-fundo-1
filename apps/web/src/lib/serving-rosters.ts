/**
 * Contrato de leitura das escalas Atmosfera / Louvor / Meu Espaço.
 * Espelha o que MinistriesService já persiste. Não inventa ministério,
 * equipe, ensaio nem lista de terceiros.
 */

export const ROSTER_LEAD_ROLES = [
  "SECRETARIA",
  "PASTOR",
  "LIDER_MINISTERIO",
  "PLATFORM_ADMIN",
] as const;

export const ACTIVE_ASSIGNMENT_STATUSES = ["PENDING", "CONFIRMED"] as const;

export const SERVING_SURFACES = {
  atmosfera: {
    title: "Atmosfera",
    slugs: ["atmosfera"],
  },
  louvor: {
    title: "Louvor",
    slugs: ["louvor", "louvor-demo"],
  },
} as const;

export type ServingSurfaceId = keyof typeof SERVING_SURFACES;

export const BLOCKED_INTEGRATIONS = [
  {
    id: "ministry-link",
    issue: "#97",
    text: "Vínculo formal de pessoa ao ministério, equipes e ensaios ainda não estão integrados. A tela só mostra a escala cujo ministryId a API já gravou.",
  },
  {
    id: "rbac-matrix",
    issue: "#101",
    text: "A matriz RBAC do PR #101 não está na main. A autorização usada aqui é a que os controllers de roster já aplicam.",
  },
  {
    id: "member-list",
    issue: "#98",
    text: "Não há consulta das atribuições do próprio membro. Meu Espaço não lista escalas de outras pessoas.",
  },
  {
    id: "messages",
    issue: "#98",
    text: "Esta tela não envia WhatsApp, e-mail ou push e não oferece reenvio de alerta.",
  },
  {
    id: "design-system",
    issue: "#93",
    text: "O Design System do PR #102 não está na main. O visual usa os tokens já publicados.",
  },
] as const;

const ASSIGNMENT_STATUSES = ["PENDING", "CONFIRMED", "DECLINED", "SUBSTITUTED"] as const;
const ROSTER_STATUSES = ["DRAFT", "PUBLISHED", "CLOSED"] as const;

export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];
export type RosterStatus = (typeof ROSTER_STATUSES)[number];

export type AssignmentView = {
  id: string;
  slotId: string;
  personId: string;
  partnerPersonId: string | null;
  status: AssignmentStatus;
  substituteForId: string | null;
};

export type SlotView = {
  id: string;
  roleLabel: string;
  requiresCouple: boolean;
  sortOrder: number;
  assignments: AssignmentView[];
};

export type RosterView = {
  id: string;
  ministryId: string | null;
  title: string;
  serviceAt: string;
  status: RosterStatus;
  slots: SlotView[];
};

export type MinistryView = {
  id: string;
  name: string;
  slug: string;
  scheduleText: string | null;
  leaderPersonId: string | null;
};

export type RosterRef = { id: string; title: string };

export type SimultaneousBlock = {
  serviceAt: string;
  personId: string;
  rosters: RosterRef[];
  assignmentIds: string[];
  internal: boolean;
};

type RecordValue = Record<string, unknown>;

function asRecord(value: unknown): RecordValue | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordValue)
    : null;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Formato inesperado: ${label} ausente na resposta da API.`);
  }
  return value;
}

function optionalString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw new Error("Formato inesperado: campo textual inválido na resposta da API.");
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value === "string" && (allowed as readonly string[]).includes(value)) {
    return value as T;
  }
  throw new Error(`Formato inesperado: ${label} não reconhecido.`);
}

export function isRosterLead(roles: readonly string[]): boolean {
  return roles.some((role) =>
    (ROSTER_LEAD_ROLES as readonly string[]).includes(role),
  );
}

export function canConfirmAssignment(
  roles: readonly string[],
  actorPersonId: string,
  assignmentPersonId: string,
): boolean {
  if (isRosterLead(roles)) return true;
  return roles.includes("MEMBRO") && actorPersonId.length > 0 && actorPersonId === assignmentPersonId;
}

export function canSubstituteAssignment(roles: readonly string[]): boolean {
  return isRosterLead(roles);
}

/** Meu Espaço nunca pede a lista da congregação ao abrir. */
export function endpointsForSurface(surface: ServingSurfaceId | "membro"): readonly string[] {
  if (surface === "membro") return ["/auth/me"];
  return ["/auth/me", "/ministries", "/rosters"];
}

export function interpretRosterProbe(status: number): "forbidden" | "allowed" | "unavailable" {
  if (status === 401 || status === 403) return "forbidden";
  if (status === 200) return "allowed";
  return "unavailable";
}

export function parseMinistryList(payload: unknown): MinistryView[] {
  const body = asRecord(payload);
  const rows = body?.ministries;
  if (!Array.isArray(rows)) {
    throw new Error("Formato inesperado: a API não devolveu a lista de ministérios.");
  }
  return rows.map((item) => {
    const row = asRecord(item);
    if (!row) throw new Error("Formato inesperado: ministério inválido.");
    return {
      id: requiredString(row.id, "ministério"),
      name: requiredString(row.name, "nome do ministério"),
      slug: requiredString(row.slug, "slug do ministério"),
      scheduleText: optionalString(row.scheduleText),
      leaderPersonId: optionalString(row.leaderPersonId),
    };
  });
}

export function parseRosterList(payload: unknown): RosterView[] {
  const body = asRecord(payload);
  const rows = body?.rosters;
  if (!Array.isArray(rows)) {
    throw new Error("Formato inesperado: a API não devolveu a lista de escalas.");
  }
  return rows.map(parseRoster);
}

function parseRoster(value: unknown): RosterView {
  const row = asRecord(value);
  if (!row) throw new Error("Formato inesperado: escala inválida.");
  const serviceAt = requiredString(row.serviceAt, "horário da escala");
  if (!Number.isFinite(Date.parse(serviceAt))) {
    throw new Error("Formato inesperado: horário da escala inválido.");
  }
  const slots = row.slots;
  if (!Array.isArray(slots)) {
    throw new Error("Formato inesperado: funções da escala ausentes.");
  }
  return {
    id: requiredString(row.id, "escala"),
    ministryId: optionalString(row.ministryId),
    title: requiredString(row.title, "título da escala"),
    serviceAt,
    status: oneOf(row.status, ROSTER_STATUSES, "estado da escala"),
    slots: slots.map(parseSlot),
  };
}

function parseSlot(value: unknown): SlotView {
  const row = asRecord(value);
  if (!row) throw new Error("Formato inesperado: função inválida.");
  const assignments = row.assignments;
  if (!Array.isArray(assignments)) {
    throw new Error("Formato inesperado: atribuições da função ausentes.");
  }
  const sortOrder = row.sortOrder;
  if (typeof sortOrder !== "number" || !Number.isInteger(sortOrder)) {
    throw new Error("Formato inesperado: ordem da função inválida.");
  }
  if (typeof row.requiresCouple !== "boolean") {
    throw new Error("Formato inesperado: regra de casal inválida.");
  }
  return {
    id: requiredString(row.id, "função"),
    roleLabel: requiredString(row.roleLabel, "nome da função"),
    requiresCouple: row.requiresCouple,
    sortOrder,
    assignments: assignments.map(parseAssignment),
  };
}

function parseAssignment(value: unknown): AssignmentView {
  const row = asRecord(value);
  if (!row) throw new Error("Formato inesperado: atribuição inválida.");
  return {
    id: requiredString(row.id, "atribuição"),
    slotId: requiredString(row.slotId, "função da atribuição"),
    personId: requiredString(row.personId, "pessoa da atribuição"),
    partnerPersonId: optionalString(row.partnerPersonId),
    status: oneOf(row.status, ASSIGNMENT_STATUSES, "estado da atribuição"),
    substituteForId: optionalString(row.substituteForId),
  };
}

export function pickSurfaceMinistry(
  ministries: readonly MinistryView[],
  surface: ServingSurfaceId,
): MinistryView | null {
  for (const slug of SERVING_SURFACES[surface].slugs) {
    const found = ministries.find((ministry) => ministry.slug === slug);
    if (found) return found;
  }
  return null;
}

export function rostersForMinistry(
  rosters: readonly RosterView[],
  ministryId: string,
): RosterView[] {
  return rosters
    .filter((roster) => roster.ministryId === ministryId)
    .slice()
    .sort((a, b) => Date.parse(a.serviceAt) - Date.parse(b.serviceAt) || a.title.localeCompare(b.title, "pt-BR"));
}

/**
 * Pessoa em duas atribuições PENDING/CONFIRMED no mesmo instante,
 * como titular ou par, na mesma escala ou em outra da congregação.
 * DECLINED e SUBSTITUTED não ocupam o horário — a mesma regra do serviço.
 */
export function findSimultaneousBlocks(
  rosters: readonly RosterView[],
): SimultaneousBlock[] {
  type Hit = {
    rosterId: string;
    title: string;
    assignmentId: string;
    personId: string;
    serviceAt: string;
    instant: number;
  };
  const hits: Hit[] = [];
  for (const roster of rosters) {
    const at = Date.parse(roster.serviceAt);
    for (const slot of roster.slots) {
      for (const assignment of slot.assignments) {
        if (
          assignment.status !== "PENDING" &&
          assignment.status !== "CONFIRMED"
        ) {
          continue;
        }
        const people = [assignment.personId, assignment.partnerPersonId].filter(
          (id): id is string => Boolean(id),
        );
        for (const personId of people) {
          hits.push({
            rosterId: roster.id,
            title: roster.title,
            assignmentId: assignment.id,
            personId,
            serviceAt: roster.serviceAt,
            instant: at,
          });
        }
      }
    }
  }

  const groups = new Map<string, Hit[]>();
  for (const hit of hits) {
    const key = `${hit.instant}\0${hit.personId}`;
    const list = groups.get(key) ?? [];
    list.push(hit);
    groups.set(key, list);
  }

  const blocks: SimultaneousBlock[] = [];
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const rosters: RosterRef[] = [];
    for (const hit of list) {
      if (!rosters.some((roster) => roster.id === hit.rosterId)) {
        rosters.push({ id: hit.rosterId, title: hit.title });
      }
    }
    blocks.push({
      serviceAt: list[0].serviceAt,
      personId: list[0].personId,
      rosters,
      assignmentIds: [...new Set(list.map((hit) => hit.assignmentId))],
      internal: rosters.length === 1,
    });
  }
  return blocks;
}

export function blocksForRoster(
  blocks: readonly SimultaneousBlock[],
  rosterId: string,
): SimultaneousBlock[] {
  return blocks.filter((block) => block.rosters.some((roster) => roster.id === rosterId));
}

export function otherRosterTitles(block: SimultaneousBlock, rosterId: string): string[] {
  if (block.internal) return [];
  return block.rosters
    .filter((roster) => roster.id !== rosterId)
    .map((roster) => roster.title);
}
