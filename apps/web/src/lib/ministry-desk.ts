/**
 * Adaptador da frente de ministérios (#97).
 * Interesse de voluntariado nunca vira integrante.
 * Saldo permanece oculto até o contrato financeiro #96.
 */

export const MINISTRY_FINANCE_CONTRACT_APPROVED = false;

export const FORMAL_ROLES = ["LIDER", "COORDENADOR", "INTEGRANTE", "APOIO"] as const;
export const FORMAL_STATUSES = ["ATIVO", "CONVIDADO", "PAUSADO", "ENCERRADO"] as const;

export type FormalRole = (typeof FORMAL_ROLES)[number];
export type FormalStatus = (typeof FORMAL_STATUSES)[number];

export type MinistryOption = { id: string; name: string };

export type FormalMember = {
  id: string;
  personId: string;
  displayName: string;
  role: FormalRole;
  status: FormalStatus;
};

export type InterestRow = {
  id: string;
  displayName: string;
  stage: string;
  status: string;
  formalMember: false;
};

export type BlockedPanel = {
  kind: "blocked";
  code: string;
  message: string;
};

export type DeniedPanel = {
  kind: "denied";
  status: 403;
  code: string;
  message: string;
};

export type MembershipPanel =
  | (BlockedPanel & { members: null })
  | (DeniedPanel & { members: null })
  | { kind: "ready"; members: FormalMember[]; message: string };

export type AgendaPanel =
  | (BlockedPanel & { scheduleText: string | null; items: null })
  | (DeniedPanel & { scheduleText: null; items: null });

export type RequestsPanel =
  | (BlockedPanel & { requests: null })
  | (DeniedPanel & { requests: null });

export type FinancePanel =
  | (BlockedPanel & { balance: null; dependency: "issue-96" })
  | (DeniedPanel & { balance: null });

export type DeskReady = {
  kind: "ready";
  ministries: MinistryOption[];
  ministry: MinistryOption;
  membership: MembershipPanel;
  interests: InterestRow[];
  interestsMessage: string;
  agenda: AgendaPanel;
  requests: RequestsPanel;
  finance: FinancePanel;
};

export type DeskResult =
  | { kind: "unauthorized"; message: string }
  | { kind: "empty"; message: string }
  | { kind: "error"; message: string }
  | {
      kind: "denied";
      ministries: MinistryOption[];
      ministry: MinistryOption;
      status: 403;
      code: string;
      message: string;
    }
  | DeskReady;

export type ConversionResult = {
  created: boolean;
  status: number;
  code: string;
  message: string;
  member: FormalMember | null;
};

type FetchLike = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{ status: number; text: () => Promise<string> }>;

const SCOPE_DENIED = "Líder só visualiza dados do ministério autorizado.";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function readCode(body: unknown, fallback: string): string {
  return textOf(asRecord(body)?.code) || fallback;
}

export function readMessage(body: unknown, fallback: string): string {
  const message = asRecord(body)?.message;
  if (typeof message === "string" && message.trim()) return message.trim();
  if (Array.isArray(message) && typeof message[0] === "string") return message[0];
  return fallback;
}

export function readMinistries(body: unknown): MinistryOption[] {
  const list = asRecord(body)?.ministries;
  if (!Array.isArray(list)) return [];
  const options: MinistryOption[] = [];
  for (const item of list) {
    const row = asRecord(item);
    const id = textOf(row?.id);
    if (!id) continue;
    options.push({ id, name: textOf(row?.name) || "Ministério" });
  }
  return options;
}

/** Projeção pública do interesse. E-mail, telefone e nota interna ficam de fora. */
export function readInterests(body: unknown): InterestRow[] {
  const list = asRecord(body)?.interests;
  if (!Array.isArray(list)) return [];
  const rows: InterestRow[] = [];
  for (const item of list) {
    const row = asRecord(item);
    const id = textOf(row?.id);
    if (!row || !id) continue;
    rows.push({
      id,
      displayName: textOf(row.displayName) || "Manifestação sem nome público",
      stage: textOf(row.stage) || "INTERESSE",
      status: textOf(row.status) || "OPEN",
      formalMember: false,
    });
  }
  return rows;
}

/**
 * Aceita somente o contrato formal.
 * Um interesse (tem `stage` e não tem papel de integrante) é recusado por inteiro.
 */
export function acceptFormalMembers(body: unknown): FormalMember[] | null {
  const row = asRecord(body);
  if (!row || row.blocked === true || !Array.isArray(row.members)) return null;
  const members: FormalMember[] = [];
  for (const item of row.members) {
    const member = asRecord(item);
    if (!member) return null;
    if (typeof member.stage === "string" && typeof member.role !== "string") return null;
    const role = textOf(member.role);
    const status = textOf(member.status);
    const id = textOf(member.id);
    const personId = textOf(member.personId);
    const displayName = textOf(member.displayName);
    if (
      !id ||
      !personId ||
      !displayName ||
      !FORMAL_ROLES.includes(role as FormalRole) ||
      !FORMAL_STATUSES.includes(status as FormalStatus)
    ) {
      return null;
    }
    members.push({
      id,
      personId,
      displayName,
      role: role as FormalRole,
      status: status as FormalStatus,
    });
  }
  return members;
}

export function presentMembership(status: number, body: unknown): MembershipPanel {
  if (status === 403) {
    return {
      kind: "denied",
      status: 403,
      code: readCode(body, "MINISTRY_SCOPE_FORBIDDEN"),
      message: readMessage(body, SCOPE_DENIED),
      members: null,
    };
  }
  if (status === 200) {
    const members = acceptFormalMembers(body);
    if (members) {
      return {
        kind: "ready",
        members,
        message: members.length
          ? "Integrantes devolvidos pelo cadastro formal."
          : "O cadastro formal respondeu sem integrantes.",
      };
    }
  }
  return {
    kind: "blocked",
    code: readCode(body, "MINISTRY_MEMBERSHIP_SCHEMA_BLOCKED"),
    message: readMessage(
      body,
      "O cadastro formal de integrante ainda não está disponível.",
    ),
    members: null,
  };
}

export function presentAgenda(status: number, body: unknown): AgendaPanel {
  if (status === 403) {
    return {
      kind: "denied",
      status: 403,
      code: readCode(body, "MINISTRY_SCOPE_FORBIDDEN"),
      message: readMessage(body, SCOPE_DENIED),
      scheduleText: null,
      items: null,
    };
  }
  const scheduleText = textOf(asRecord(body)?.scheduleText) || null;
  return {
    kind: "blocked",
    code: readCode(body, "MINISTRY_AGENDA_MODEL_BLOCKED"),
    message: readMessage(body, "A agenda estruturada do ministério ainda não existe."),
    scheduleText,
    items: null,
  };
}

export function presentRequests(status: number, body: unknown): RequestsPanel {
  if (status === 403) {
    return {
      kind: "denied",
      status: 403,
      code: readCode(body, "MINISTRY_SCOPE_FORBIDDEN"),
      message: readMessage(body, SCOPE_DENIED),
      requests: null,
    };
  }
  return {
    kind: "blocked",
    code: readCode(body, "MINISTRY_REQUEST_MODEL_BLOCKED"),
    message: readMessage(body, "Solicitações do ministério ainda não têm modelo."),
    requests: null,
  };
}

/** Número de saldo, se vier, é descartado. O contrato #96 ainda não foi aceito. */
export function presentFinance(status: number, body: unknown): FinancePanel {
  if (status === 403) {
    return {
      kind: "denied",
      status: 403,
      code: readCode(body, "MINISTRY_SCOPE_FORBIDDEN"),
      message: readMessage(body, SCOPE_DENIED),
      balance: null,
    };
  }
  return {
    kind: "blocked",
    code: readCode(body, "MINISTRY_FINANCE_CONTRACT_BLOCKED"),
    message: MINISTRY_FINANCE_CONTRACT_APPROVED
      ? "Contrato financeiro reconhecido, sem leitura de saldo nesta tela."
      : readMessage(
          body,
          "O saldo do ministério depende do contrato financeiro e permanece oculto.",
        ),
    balance: null,
    dependency: "issue-96",
  };
}

export function interpretConversion(status: number, body: unknown): ConversionResult {
  const wrapped = asRecord(body)?.createdMembership;
  const accepted =
    status === 201
      ? acceptFormalMembers({ blocked: false, members: wrapped ? [wrapped] : [] })
      : null;
  const member = accepted?.[0] ?? null;
  if (member) {
    return {
      created: true,
      status,
      code: readCode(body, "MINISTRY_MEMBERSHIP_CREATED"),
      message: "O cadastro formal registrou o integrante.",
      member,
    };
  }
  const code = readCode(
    body,
    status === 403 ? "MINISTRY_SCOPE_FORBIDDEN" : "MINISTRY_INTEREST_CONVERSION_BLOCKED",
  );
  const message = readMessage(
    body,
    status === 403
      ? SCOPE_DENIED
      : "Nenhum integrante foi criado. A conversão continua bloqueada.",
  );
  return { created: false, status, code, message, member: null };
}

async function requestJson(
  fetchImpl: FetchLike,
  url: string,
  token: string,
  method = "GET",
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const response = await fetchImpl(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await response.text();
  if (!raw) return { status: response.status, body: null };
  try {
    return { status: response.status, body: JSON.parse(raw) as unknown };
  } catch {
    return { status: response.status, body: { message: raw } };
  }
}

export async function loadMinistryDesk(options: {
  token: string;
  baseUrl: string;
  ministryId?: string;
  fetchImpl?: FetchLike;
}): Promise<DeskResult> {
  const fetchImpl = options.fetchImpl ?? (fetch as unknown as FetchLike);
  const base = options.baseUrl.replace(/\/$/, "");
  const listed = await requestJson(fetchImpl, `${base}/ministries`, options.token);
  if (listed.status === 401 || listed.status === 403) {
    return {
      kind: "unauthorized",
      message: readMessage(listed.body, "Esta conta não pode abrir o catálogo de ministérios."),
    };
  }
  if (listed.status !== 200) {
    return {
      kind: "error",
      message: readMessage(listed.body, "Não foi possível consultar os ministérios autorizados."),
    };
  }
  const ministries = readMinistries(listed.body);
  if (!ministries.length) {
    return {
      kind: "empty",
      message: "Nenhum ministério está autorizado para esta conta.",
    };
  }
  const ministry = ministries.find((item) => item.id === options.ministryId) ?? ministries[0];
  const scope = `${base}/ministry-scope/${encodeURIComponent(ministry.id)}`;
  const membershipRes = await requestJson(
    fetchImpl,
    `${scope}/formal-memberships`,
    options.token,
  );
  if (membershipRes.status === 403) {
    return {
      kind: "denied",
      ministries,
      ministry,
      status: 403,
      code: readCode(membershipRes.body, "MINISTRY_SCOPE_FORBIDDEN"),
      message: readMessage(membershipRes.body, SCOPE_DENIED),
    };
  }

  const [agendaRes, requestsRes, financeRes, interestRes] = await Promise.all([
    requestJson(fetchImpl, `${scope}/agenda`, options.token),
    requestJson(fetchImpl, `${scope}/requests`, options.token),
    requestJson(fetchImpl, `${scope}/cost-center-balance`, options.token),
    requestJson(
      fetchImpl,
      `${base}/volunteer-interests?ministryId=${encodeURIComponent(ministry.id)}`,
      options.token,
    ),
  ]);

  const interests = interestRes.status === 200 ? readInterests(interestRes.body) : [];
  return {
    kind: "ready",
    ministries,
    ministry,
    membership: presentMembership(membershipRes.status, membershipRes.body),
    interests,
    interestsMessage:
      interestRes.status === 200
        ? "Interesse de voluntariado. Não é vínculo formal com o ministério."
        : readMessage(interestRes.body, "Os interesses deste ministério não puderam ser lidos."),
    agenda: presentAgenda(agendaRes.status, agendaRes.body),
    requests: presentRequests(requestsRes.status, requestsRes.body),
    finance: presentFinance(financeRes.status, financeRes.body),
  };
}

export async function requestInterestConversion(options: {
  token: string;
  baseUrl: string;
  ministryId: string;
  volunteerInterestId: string;
  fetchImpl?: FetchLike;
}): Promise<ConversionResult> {
  const fetchImpl = options.fetchImpl ?? (fetch as unknown as FetchLike);
  const base = options.baseUrl.replace(/\/$/, "");
  const response = await requestJson(
    fetchImpl,
    `${base}/ministry-scope/${encodeURIComponent(options.ministryId)}/formal-memberships/from-interest`,
    options.token,
    "POST",
    { volunteerInterestId: options.volunteerInterestId },
  );
  return interpretConversion(response.status, response.body);
}
