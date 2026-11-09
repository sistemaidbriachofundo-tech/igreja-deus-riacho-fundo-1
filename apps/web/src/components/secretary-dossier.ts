/**
 * Ficha da Secretaria contra o contrato atual de pessoa.
 * PATCH /persons/:id grava só isMinor, legalGuardianPersonId e householdId.
 * Nome, e-mail, situação, tipo e observações são consulta — nunca simulados.
 */

export const PATCHABLE_PERSON_FIELDS = [
  "isMinor",
  "legalGuardianPersonId",
  "householdId",
] as const;

export type PatchablePersonField = (typeof PATCHABLE_PERSON_FIELDS)[number];

export const UNSUPPORTED_PERSON_FIELDS = [
  { key: "displayName", label: "Nome" },
  { key: "email", label: "E-mail" },
  { key: "status", label: "Situação da pessoa" },
  { key: "kind", label: "Tipo de cadastro" },
  { key: "notes", label: "Observações do vínculo" },
] as const;

export type PersonPhoto = { status: string; hasStorageKey: boolean };

export type PersonRecord = {
  id: string;
  displayName: string;
  email: string | null;
  status: string;
  householdId: string | null;
  kind: string;
  isMinor: boolean;
  legalGuardianPersonId: string | null;
  photo?: PersonPhoto;
};

export type DossierMembership = {
  id: string;
  status: string;
  joinedAt: string;
  notes: string | null;
};

export type DossierAdmission = {
  id: string;
  status: string;
  modality: string | null;
  currentStep: string;
  checklist: {
    modalityRecorded: boolean;
    documentsComplete: boolean;
    secretariaApproved: boolean;
    pastorApproved: boolean;
  };
  createdAt: string;
  updatedAt: string;
};

export type PersonDossier = {
  person: PersonRecord;
  legalGuardian: { id: string; displayName: string; email: string | null } | null;
  dependents: Array<{ id: string; displayName: string; isMinor: boolean }>;
  household: {
    id: string;
    label: string;
    members: Array<{ id: string; displayName: string; isMinor: boolean }>;
  } | null;
  memberships: DossierMembership[];
  admissionHistory: DossierAdmission[];
};

export type EditablePersonFields = {
  isMinor: boolean;
  legalGuardianPersonId: string;
  householdId: string;
};

export type PersonPatchBody = {
  isMinor?: boolean;
  legalGuardianPersonId?: string | null;
  householdId?: string | null;
};

export type DossierFailureKind =
  | "session"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "validation"
  | "unknown";

export type DossierFailure = {
  kind: DossierFailureKind;
  status: number | null;
  message: string;
};

export type DossierClient = {
  get<T>(path: string, token: string): Promise<T>;
  patch<T>(path: string, token: string, body: unknown): Promise<T>;
};

export type LoadedDossier = { person: PersonRecord; dossier: PersonDossier };

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Ativo",
  INACTIVE: "Inativo",
  PENDING_ADMISSION: "Em admissão",
  TRANSFERRED: "Transferido",
  APPROVED: "Aprovado",
  DRAFT: "Rascunho",
  AWAITING_DOCUMENTS: "Documentação",
  AWAITING_SECRETARIA: "Análise da secretaria",
  AWAITING_PASTOR: "Aprovação pastoral",
  REJECTED: "Recusado",
  CANCELLED: "Cancelado",
  VISITOR: "Visitante",
  MEMBER: "Membro",
};

export function dossierLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return STATUS_LABELS[value] ?? value.replaceAll("_", " ");
}

export function toEditable(
  person: Pick<PersonRecord, "isMinor" | "legalGuardianPersonId" | "householdId">,
): EditablePersonFields {
  return {
    isMinor: person.isMinor,
    legalGuardianPersonId: person.legalGuardianPersonId ?? "",
    householdId: person.householdId ?? "",
  };
}

export function buildPersonPatch(
  current: EditablePersonFields,
  baseline: EditablePersonFields,
): PersonPatchBody | null {
  const body: PersonPatchBody = {};
  if (current.isMinor !== baseline.isMinor) body.isMinor = current.isMinor;
  if (current.legalGuardianPersonId !== baseline.legalGuardianPersonId) {
    const value = current.legalGuardianPersonId.trim();
    body.legalGuardianPersonId = value.length > 0 ? value : null;
  }
  if (current.householdId !== baseline.householdId) {
    const value = current.householdId.trim();
    body.householdId = value.length > 0 ? value : null;
  }
  return Object.keys(body).length > 0 ? body : null;
}

/** Recusa qualquer chave fora do contrato, mesmo que o chamador a tenha inserido. */
export function assertSupportedPatch(body: PersonPatchBody): PersonPatchBody {
  const allowed = new Set<string>(PATCHABLE_PERSON_FIELDS);
  const extra = Object.keys(body).filter((key) => !allowed.has(key));
  if (extra.length > 0) {
    throw new Error("Campo fora do contrato de PATCH: " + extra.join(", "));
  }
  return body;
}

export function readHttpStatus(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as { statusCode?: unknown };
      if (typeof parsed.statusCode === "number") return parsed.statusCode;
    } catch {
      /* corpo que não é JSON */
    }
  }
  const wrapped = trimmed.match(/\((\d{3})\)/);
  return wrapped ? Number(wrapped[1]) : null;
}

export function readApiMessage(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as { message?: unknown };
      if (typeof parsed.message === "string" && parsed.message.trim()) return parsed.message.trim();
      if (Array.isArray(parsed.message)) {
        const text = parsed.message.filter((item): item is string => typeof item === "string").join(" ");
        if (text.trim()) return text.trim();
      }
    } catch {
      /* texto puro */
    }
  }
  return trimmed;
}

export function classifyDossierError(error: unknown): DossierFailure {
  const raw = error instanceof Error ? error.message : "Operação não concluída.";
  const status = readHttpStatus(raw);
  const detail = readApiMessage(raw);
  if (status === 401) {
    return {
      kind: "session",
      status,
      message: "Sua sessão expirou. Entre novamente. O que você digitou continua neste formulário.",
    };
  }
  if (status === 403) {
    return {
      kind: "forbidden",
      status,
      message: "Seu perfil não tem permissão para esta ficha.",
    };
  }
  if (status === 404) {
    return {
      kind: "not_found",
      status,
      message: detail.length > 0 && detail.length < 180 ? detail : "Cadastro não encontrado neste escopo.",
    };
  }
  if (status === 409) {
    return {
      kind: "conflict",
      status,
      message: "A API recusou a gravação por conflito (409). A ficha não foi alterada e o formulário foi mantido.",
    };
  }
  if (status === 400) {
    return {
      kind: "validation",
      status,
      message: detail || "A API recusou os campos enviados. Revise responsável legal e família.",
    };
  }
  if (status === null && /sess[aã]o expirou|jwt expired|token expired/i.test(raw)) {
    return {
      kind: "session",
      status: 401,
      message: "Sua sessão expirou. Entre novamente. O que você digitou continua neste formulário.",
    };
  }
  const message = detail.length > 220 ? detail.slice(0, 220) : detail;
  return {
    kind: "unknown",
    status,
    message: message || "Operação não concluída. Confira os dados e tente novamente.",
  };
}

function isPersonRecord(value: unknown): value is PersonRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<PersonRecord>;
  return typeof record.id === "string"
    && typeof record.displayName === "string"
    && typeof record.isMinor === "boolean";
}

function normalizeDossier(dossier: PersonDossier): PersonDossier {
  return {
    ...dossier,
    legalGuardian: dossier.legalGuardian ?? null,
    dependents: Array.isArray(dossier.dependents) ? dossier.dependents : [],
    household: dossier.household ?? null,
    memberships: Array.isArray(dossier.memberships) ? dossier.memberships : [],
    admissionHistory: Array.isArray(dossier.admissionHistory) ? dossier.admissionHistory : [],
  };
}

export async function loadPersonDossier(
  client: DossierClient,
  token: string,
  personId: string,
): Promise<{ ok: true; data: LoadedDossier } | { ok: false; failure: DossierFailure }> {
  const pathId = encodeURIComponent(personId);
  try {
    const [person, dossier] = await Promise.all([
      client.get<PersonRecord>("/persons/" + pathId, token),
      client.get<PersonDossier>("/persons/" + pathId + "/dossier", token),
    ]);
    if (!isPersonRecord(person) || !isPersonRecord(dossier?.person) || person.id !== dossier.person.id) {
      return {
        ok: false,
        failure: {
          kind: "unknown",
          status: null,
          message: "A ficha voltou em formato inesperado. Nada foi alterado.",
        },
      };
    }
    return { ok: true, data: { person, dossier: normalizeDossier(dossier) } };
  } catch (error) {
    return { ok: false, failure: classifyDossierError(error) };
  }
}

export async function savePersonDossier(
  client: DossierClient,
  token: string,
  personId: string,
  current: EditablePersonFields,
  baseline: EditablePersonFields,
): Promise<
  | { ok: true; person: PersonRecord }
  | { ok: false; unchanged: true }
  | { ok: false; failure: DossierFailure }
> {
  const patch = buildPersonPatch(current, baseline);
  if (!patch) return { ok: false, unchanged: true };
  try {
    const person = await client.patch<PersonRecord>(
      "/persons/" + encodeURIComponent(personId),
      token,
      assertSupportedPatch(patch),
    );
    if (!isPersonRecord(person)) {
      return {
        ok: false,
        failure: {
          kind: "unknown",
          status: null,
          message: "A API não confirmou a ficha gravada. O formulário foi mantido.",
        },
      };
    }
    return { ok: true, person };
  } catch (error) {
    return { ok: false, failure: classifyDossierError(error) };
  }
}

export type FichaPhase = "loading" | "ready" | "saving" | "reopening";

export type FichaState = {
  phase: FichaPhase;
  person: PersonRecord | null;
  dossier: PersonDossier | null;
  form: EditablePersonFields | null;
  baseline: EditablePersonFields | null;
  loadError: DossierFailure | null;
  saveError: DossierFailure | null;
  refreshError: DossierFailure | null;
  notice: string;
  loadMs: number | null;
  saveMs: number | null;
};

export const initialFichaState: FichaState = {
  phase: "loading",
  person: null,
  dossier: null,
  form: null,
  baseline: null,
  loadError: null,
  saveError: null,
  refreshError: null,
  notice: "",
  loadMs: null,
  saveMs: null,
};

export type FichaEvent =
  | { type: "load-ok"; data: LoadedDossier; elapsedMs: number }
  | { type: "load-fail"; failure: DossierFailure; elapsedMs: number }
  | { type: "edit"; form: EditablePersonFields }
  | { type: "saving" }
  | { type: "save-unchanged" }
  | { type: "save-fail"; failure: DossierFailure }
  | { type: "save-ok"; person: PersonRecord }
  | { type: "reopening" }
  | { type: "reopen-ok"; data: LoadedDossier; elapsedMs: number; context: "after-save" | "manual" }
  | { type: "reopen-fail"; failure: DossierFailure; elapsedMs: number; context: "after-save" | "manual" };

function refreshFailure(failure: DossierFailure, context: "after-save" | "manual"): DossierFailure {
  const prefix = context === "after-save"
    ? "A gravação foi aceita pela API, mas a releitura da ficha falhou. Isso não é falha de salvamento. "
    : "Não foi possível reabrir a ficha. O formulário digitado foi mantido. ";
  return { ...failure, message: prefix + failure.message };
}

export function fichaReducer(state: FichaState, event: FichaEvent): FichaState {
  switch (event.type) {
    case "load-ok":
      return {
        ...state,
        phase: "ready",
        person: event.data.person,
        dossier: event.data.dossier,
        form: toEditable(event.data.person),
        baseline: toEditable(event.data.person),
        loadError: null,
        saveError: null,
        refreshError: null,
        notice: "",
        loadMs: event.elapsedMs,
      };
    case "load-fail":
      return {
        ...state,
        phase: "ready",
        person: null,
        dossier: null,
        form: null,
        baseline: null,
        loadError: event.failure,
        saveError: null,
        refreshError: null,
        notice: "",
        loadMs: event.elapsedMs,
      };
    case "edit":
      if (!state.form) return state;
      return { ...state, form: event.form, notice: "" };
    case "saving":
      return { ...state, phase: "saving", saveError: null, refreshError: null, notice: "" };
    case "save-unchanged":
      return {
        ...state,
        phase: "ready",
        notice: "Nenhuma alteração nos campos que a API aceita gravar.",
      };
    case "save-fail":
      return {
        ...state,
        phase: "ready",
        saveError: event.failure,
        refreshError: null,
        notice: "",
      };
    case "save-ok":
      return {
        ...state,
        phase: "reopening",
        person: { ...(state.person ?? event.person), ...event.person },
        form: toEditable(event.person),
        baseline: toEditable(event.person),
        saveError: null,
        refreshError: null,
        notice: "",
      };
    case "reopening":
      return { ...state, phase: "reopening", refreshError: null, notice: "" };
    case "reopen-ok":
      return {
        ...state,
        phase: "ready",
        person: event.data.person,
        dossier: event.data.dossier,
        form: toEditable(event.data.person),
        baseline: toEditable(event.data.person),
        saveError: null,
        refreshError: null,
        notice: event.context === "after-save"
          ? "Ficha salva e reaberta com os dados devolvidos pela API."
          : "Ficha reaberta com os dados atuais da API.",
        saveMs: event.context === "after-save" ? event.elapsedMs : state.saveMs,
      };
    case "reopen-fail":
      return {
        ...state,
        phase: "ready",
        refreshError: refreshFailure(event.failure, event.context),
        saveMs: event.context === "after-save" ? event.elapsedMs : state.saveMs,
      };
    default:
      return state;
  }
}
