/**
 * Ficha 360 da Secretaria contra o contrato já publicado.
 * PATCH /persons/:id grava displayName, email, isMinor, legalGuardianPersonId,
 * householdId e expectedUpdatedAt.
 * PATCH /memberships/:id grava a observação do vínculo mais recente.
 * Situação, tipo e telefones continuam fora da edição direta.
 * Casos pastorais não são pedidos por esta ficha.
 */

import { PERSON_PROFILE_DATES, type PersonProfileDates, type PersonProfileFields, type PersonSex, type PersonTimelineEvent } from "@idbrf/shared";

export const PATCHABLE_PERSON_FIELDS = [
  "displayName",
  "email",
  "address",
  ...PERSON_PROFILE_DATES,
  "sex",
  "isMinor",
  "legalGuardianPersonId",
  "householdId",
  "expectedUpdatedAt",
] as const;

export type PatchablePersonField = (typeof PATCHABLE_PERSON_FIELDS)[number];

export const REGULATED_PERSON_FIELDS = [
  { key: "status", label: "Situação da pessoa" },
  { key: "kind", label: "Tipo de cadastro" },
] as const;

export type PersonPhoto = { status: string; hasStorageKey: boolean };

export type PersonRecord = PersonProfileFields & {
  id: string;
  displayName: string;
  email: string | null;
  address?: string | null;
  status: string;
  householdId: string | null;
  kind: string;
  isMinor: boolean;
  legalGuardianPersonId: string | null;
  updatedAt?: string;
  photo?: PersonPhoto;
  photoUrl?: string | null;
  dedupeAlerts?: Array<{ personId: string }>;
};

export type DossierMembership = {
  id: string;
  status: string;
  joinedAt: string;
  notes: string | null;
  updatedAt?: string;
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

export type AdmissionDocumentMeta = {
  id: string;
  admissionId?: string;
  displayName: string;
  contentType: string;
  byteSize: number;
  createdAt: string;
};

export type AdmissionDocumentList = {
  admissionId: string;
  documents: AdmissionDocumentMeta[];
  failure: DossierFailure | null;
};

export type PersonDossier = {
  person: PersonRecord;
  legalGuardian: {
    id: string;
    displayName: string;
    email: string | null;
  } | null;
  dependents: Array<{ id: string; displayName: string; isMinor: boolean }>;
  household: {
    id: string;
    label: string;
    members: Array<{ id: string; displayName: string; isMinor: boolean }>;
  } | null;
  memberships: DossierMembership[];
  admissionHistory: DossierAdmission[];
  timeline?: PersonTimelineEvent[];
  access?: { status: string; roles: string[] } | null;
};

export type EditablePersonFields = Partial<Record<PersonProfileDates, string>> & {
  sex?: PersonSex | "";
  displayName: string;
  email: string;
  address?: string;
  isMinor: boolean;
  legalGuardianPersonId: string;
  householdId: string;
  notes: string;
};

export type PersonPatchBody = PersonProfileFields & {
  address?: string | null;
  displayName?: string;
  email?: string | null;
  isMinor?: boolean;
  legalGuardianPersonId?: string | null;
  householdId?: string | null;
  expectedUpdatedAt?: string;
};

export type MembershipNotesBody = {
  notes: string | null;
  expectedUpdatedAt?: string;
};

export type DossierVersions = {
  personUpdatedAt: string | null;
  membershipId: string | null;
  membershipUpdatedAt: string | null;
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

const SYNTHETIC_EMAIL = /^[^\s@]+@example\.test$/;

export function dossierLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return STATUS_LABELS[value] ?? value.replaceAll("_", " ");
}

export function collapseName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function primaryMembership(
  dossier: PersonDossier | null | undefined,
): DossierMembership | null {
  return dossier?.memberships[0] ?? null;
}

export function toEditable(
  person: Pick<
    PersonRecord,
    | "displayName"
    | "email"
    | "address"
    | "isMinor"
    | "legalGuardianPersonId"
    | "householdId"
    | PersonProfileDates
    | "sex"
  >,
  notes: string | null | undefined,
): EditablePersonFields {
  const profile: Partial<Record<PersonProfileDates, string>> = {};
  for (const key of PERSON_PROFILE_DATES) {
    if (person[key] !== undefined) profile[key] = person[key] ?? "";
  }
  return {
    displayName: person.displayName,
    email: person.email ?? "",
    ...(person.address === undefined ? {} : { address: person.address ?? "" }),
    ...profile,
    ...(person.sex === undefined ? {} : { sex: person.sex ?? "" }),
    isMinor: person.isMinor,
    legalGuardianPersonId: person.legalGuardianPersonId ?? "",
    householdId: person.householdId ?? "",
    notes: notes ?? "",
  };
}

export function versionsFrom(
  person: PersonRecord,
  dossier: PersonDossier,
): DossierVersions {
  const membership = primaryMembership(dossier);
  return {
    personUpdatedAt: person.updatedAt ?? null,
    membershipId: membership?.id ?? null,
    membershipUpdatedAt: membership?.updatedAt ?? null,
  };
}

export function buildPersonPatch(
  current: EditablePersonFields,
  baseline: EditablePersonFields,
  personUpdatedAt: string | null,
): PersonPatchBody | null {
  const body: PersonPatchBody = {};
  const name = collapseName(current.displayName);
  if (name !== collapseName(baseline.displayName)) body.displayName = name;
  const email = current.email.trim().toLowerCase();
  const previousEmail = baseline.email.trim().toLowerCase();
  if (email !== previousEmail) body.email = email.length > 0 ? email : null;
  if (current.address !== undefined) {
    const address = current.address.trim();
    if (address !== (baseline.address ?? "").trim()) body.address = address || null;
  }
  for (const key of PERSON_PROFILE_DATES) {
    if (current[key] !== undefined && current[key] !== baseline[key]) body[key] = current[key] || null;
  }
  if (current.sex !== undefined && current.sex !== baseline.sex) body.sex = current.sex || null;
  if (current.isMinor !== baseline.isMinor) body.isMinor = current.isMinor;
  if (current.legalGuardianPersonId !== baseline.legalGuardianPersonId) {
    const value = current.legalGuardianPersonId.trim();
    body.legalGuardianPersonId = value.length > 0 ? value : null;
  }
  if (current.householdId !== baseline.householdId) {
    const value = current.householdId.trim();
    body.householdId = value.length > 0 ? value : null;
  }
  if (Object.keys(body).length === 0) return null;
  if (personUpdatedAt) body.expectedUpdatedAt = personUpdatedAt;
  return body;
}

export function buildMembershipNotesPatch(
  current: EditablePersonFields,
  baseline: EditablePersonFields,
  versions: DossierVersions,
): { membershipId: string; body: MembershipNotesBody } | null {
  const notes = current.notes.trim();
  const previous = baseline.notes.trim();
  if (notes === previous) return null;
  if (!versions.membershipId) return null;
  const body: MembershipNotesBody = { notes: notes.length > 0 ? notes : null };
  if (versions.membershipUpdatedAt)
    body.expectedUpdatedAt = versions.membershipUpdatedAt;
  return { membershipId: versions.membershipId, body };
}

/** Recusa situação, tipo, telefone, endereço e qualquer chave fora do contrato. */
export function assertSupportedPatch(body: PersonPatchBody): PersonPatchBody {
  const allowed = new Set<string>(PATCHABLE_PERSON_FIELDS);
  const extra = Object.keys(body).filter((key) => !allowed.has(key));
  if (extra.length > 0) {
    throw new Error("Campo fora do contrato de PATCH: " + extra.join(", "));
  }
  return body;
}

export function localFieldError(
  current: EditablePersonFields,
  baseline: EditablePersonFields,
): string | null {
  const nameChanged =
    collapseName(current.displayName) !== collapseName(baseline.displayName);
  if (nameChanged) {
    const name = collapseName(current.displayName);
    if (name.length < 2 || name.length > 160) {
      return "O nome precisa ter entre 2 e 160 caracteres.";
    }
  }
  const email = current.email.trim().toLowerCase();
  const emailChanged = email !== baseline.email.trim().toLowerCase();
  if (emailChanged && email.length > 0 && !SYNTHETIC_EMAIL.test(email)) {
    return "Na homologação o e-mail de contato precisa terminar em @example.test.";
  }
  if ((current.address ?? "").trim().length > 500) return "O endereço pode ter até 500 caracteres.";
  if (current.notes.trim().length > 4000) {
    return "A observação pode ter até 4000 caracteres.";
  }
  if (current.isMinor && !current.legalGuardianPersonId.trim())
    return "Escolha um responsável legal adulto para este cadastro.";
  return null;
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
      if (typeof parsed.message === "string" && parsed.message.trim())
        return parsed.message.trim();
      if (Array.isArray(parsed.message)) {
        const text = parsed.message
          .filter((item): item is string => typeof item === "string")
          .join(" ");
        if (text.trim()) return text.trim();
      }
    } catch {
      /* texto puro */
    }
  }
  return trimmed;
}

export function classifyDossierError(error: unknown): DossierFailure {
  const raw =
    error instanceof Error ? error.message : "Operação não concluída.";
  const status = readHttpStatus(raw);
  const detail = readApiMessage(raw)
    .replace(/\s*\(legalGuardianPersonId\)/g, "")
    .replace(/no piloto/g, "na congregação")
    .replace(/legalGuardianPersonId/g, "responsável legal")
    .replace(/householdId/g, "família");
  if (status === 401) {
    return {
      kind: "session",
      status,
      message:
        "Sua sessão expirou. Entre novamente. O que você digitou continua neste formulário.",
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
      message:
        detail.length > 0 && detail.length < 180
          ? detail
          : "Cadastro não encontrado nesta congregação.",
    };
  }
  if (status === 409) {
    const specific = detail && detail !== raw ? detail : "";
    return {
      kind: "conflict",
      status,
      message: specific
        ? specific + " Suas alterações continuam no formulário."
        : "O cadastro foi atualizado por outra pessoa. Use Atualizar ficha para conferir os dados antes de salvar.",
    };
  }
  if (status === 400) {
    return {
      kind: "validation",
      status,
      message:
        detail ||
        "Revise nome, e-mail, responsável legal e família antes de salvar.",
    };
  }
  if (
    status === null &&
    /sess[aã]o expirou|jwt expired|token expired/i.test(raw)
  ) {
    return {
      kind: "session",
      status: 401,
      message:
        "Sua sessão expirou. Entre novamente. O que você digitou continua neste formulário.",
    };
  }
  const message =
    detail.length <= 220 &&
    !/fetch|network|ECONN|Prisma|SQL|stack|statusCode|endpoint|schema/i.test(
      detail,
    )
      ? detail
      : "";
  return {
    kind: "unknown",
    status,
    message:
      message || "Operação não concluída. Confira os dados e tente novamente.",
  };
}

function isPersonRecord(value: unknown): value is PersonRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<PersonRecord>;
  return (
    typeof record.id === "string" &&
    typeof record.displayName === "string" &&
    typeof record.isMinor === "boolean"
  );
}

function normalizeDossier(dossier: PersonDossier): PersonDossier {
  return {
    ...dossier,
    legalGuardian: dossier.legalGuardian ?? null,
    dependents: Array.isArray(dossier.dependents) ? dossier.dependents : [],
    household: dossier.household ?? null,
    memberships: Array.isArray(dossier.memberships) ? dossier.memberships : [],
    admissionHistory: Array.isArray(dossier.admissionHistory)
      ? dossier.admissionHistory
      : [],
  };
}

export async function loadPersonDossier(
  client: DossierClient,
  token: string,
  personId: string,
): Promise<
  { ok: true; data: LoadedDossier } | { ok: false; failure: DossierFailure }
> {
  const pathId = encodeURIComponent(personId);
  try {
    const [person, dossier] = await Promise.all([
      client.get<PersonRecord>("/persons/" + pathId, token),
      client.get<PersonDossier>("/persons/" + pathId + "/dossier", token),
    ]);
    if (
      !isPersonRecord(person) ||
      !isPersonRecord(dossier?.person) ||
      person.id !== dossier.person.id
    ) {
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

function isDocumentMeta(value: unknown): value is AdmissionDocumentMeta {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<AdmissionDocumentMeta>;
  return (
    typeof row.id === "string" &&
    typeof row.displayName === "string" &&
    typeof row.contentType === "string" &&
    typeof row.byteSize === "number"
  );
}

/** Lista metadados já gravados em GET /admissions/:id/documents. Não baixa o arquivo. */
export async function loadAdmissionDocuments(
  client: DossierClient,
  token: string,
  admissionIds: readonly string[],
): Promise<AdmissionDocumentList[]> {
  return Promise.all(
    admissionIds.map(async (admissionId) => {
      try {
        const payload = await client.get<{ documents?: unknown }>(
          "/admissions/" + encodeURIComponent(admissionId) + "/documents",
          token,
        );
        const documents = Array.isArray(payload?.documents)
          ? payload.documents.filter(isDocumentMeta)
          : [];
        return { admissionId, documents, failure: null };
      } catch (error) {
        return {
          admissionId,
          documents: [],
          failure: classifyDossierError(error),
        };
      }
    }),
  );
}

export async function savePersonDossier(
  client: DossierClient,
  token: string,
  personId: string,
  current: EditablePersonFields,
  baseline: EditablePersonFields,
  versions: DossierVersions,
): Promise<
  | { ok: true; person: PersonRecord | null }
  | { ok: false; unchanged: true }
  | { ok: false; failure: DossierFailure; partialPerson?: PersonRecord }
> {
  const invalid = localFieldError(current, baseline);
  if (invalid) {
    return {
      ok: false,
      failure: { kind: "validation", status: null, message: invalid },
    };
  }
  const notesChanged = current.notes.trim() !== baseline.notes.trim();
  if (notesChanged && !versions.membershipId) {
    return {
      ok: false,
      failure: {
        kind: "validation",
        status: null,
        message: "Não há vínculo nesta congregação para gravar a observação.",
      },
    };
  }
  const personPatch = buildPersonPatch(
    current,
    baseline,
    versions.personUpdatedAt,
  );
  const notesPatch = buildMembershipNotesPatch(current, baseline, versions);
  if (!personPatch && !notesPatch) return { ok: false, unchanged: true };

  let savedPerson: PersonRecord | null = null;
  if (personPatch) {
    try {
      const person = await client.patch<PersonRecord>(
        "/persons/" + encodeURIComponent(personId),
        token,
        assertSupportedPatch(personPatch),
      );
      if (!isPersonRecord(person)) {
        return {
          ok: false,
          failure: {
            kind: "unknown",
            status: null,
            message:
              "Não foi possível confirmar o salvamento. Suas alterações continuam no formulário.",
          },
        };
      }
      savedPerson = person;
    } catch (error) {
      return { ok: false, failure: classifyDossierError(error) };
    }
  }

  if (notesPatch) {
    try {
      await client.patch(
        "/memberships/" + encodeURIComponent(notesPatch.membershipId),
        token,
        notesPatch.body,
      );
    } catch (error) {
      const failure = classifyDossierError(error);
      if (savedPerson) {
        return {
          ok: false,
          partialPerson: savedPerson,
          failure: {
            ...failure,
            message:
              "Os dados da pessoa foram gravados. A observação do vínculo não foi gravada. " +
              failure.message,
          },
        };
      }
      return { ok: false, failure };
    }
  }

  return { ok: true, person: savedPerson };
}

export type FichaPhase = "loading" | "ready" | "saving" | "reopening";

type DossierNotice = {
  tone: "info" | "success";
  title: string;
  detail?: string;
};

export type FichaState = {
  phase: FichaPhase;
  person: PersonRecord | null;
  dossier: PersonDossier | null;
  form: EditablePersonFields | null;
  baseline: EditablePersonFields | null;
  versions: DossierVersions;
  loadError: DossierFailure | null;
  saveError: DossierFailure | null;
  refreshError: DossierFailure | null;
  notice: DossierNotice | null;
  loadMs: number | null;
  saveMs: number | null;
};

const emptyVersions: DossierVersions = {
  personUpdatedAt: null,
  membershipId: null,
  membershipUpdatedAt: null,
};

export const initialFichaState: FichaState = {
  phase: "loading",
  person: null,
  dossier: null,
  form: null,
  baseline: null,
  versions: emptyVersions,
  loadError: null,
  saveError: null,
  refreshError: null,
  notice: null,
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
  | { type: "save-partial"; person: PersonRecord; failure: DossierFailure }
  | { type: "save-ok"; person: PersonRecord | null }
  | { type: "reopening" }
  | {
      type: "reopen-ok";
      data: LoadedDossier;
      elapsedMs: number;
      context: "after-save" | "manual";
    }
  | {
      type: "reopen-fail";
      failure: DossierFailure;
      elapsedMs: number;
      context: "after-save" | "manual";
    };

function refreshFailure(
  failure: DossierFailure,
  context: "after-save" | "manual",
): DossierFailure {
  const prefix =
    context === "after-save"
      ? "Os dados foram salvos, mas não foi possível atualizar a visualização da ficha. "
      : "Não foi possível reabrir a ficha. O formulário digitado foi mantido. ";
  return { ...failure, message: prefix + failure.message };
}

function applyLoaded(
  data: LoadedDossier,
  elapsedMs: number,
  notice: DossierNotice | null,
  saveMs: number | null,
): FichaState {
  const notes = primaryMembership(data.dossier)?.notes ?? "";
  return {
    phase: "ready",
    person: data.person,
    dossier: data.dossier,
    form: toEditable(data.person, notes),
    baseline: toEditable(data.person, notes),
    versions: versionsFrom(data.person, data.dossier),
    loadError: null,
    saveError: null,
    refreshError: null,
    notice,
    loadMs: elapsedMs,
    saveMs,
  };
}

export function fichaReducer(state: FichaState, event: FichaEvent): FichaState {
  switch (event.type) {
    case "load-ok":
      return applyLoaded(event.data, event.elapsedMs, null, null);
    case "load-fail":
      return {
        ...state,
        phase: "ready",
        person: null,
        dossier: null,
        form: null,
        baseline: null,
        versions: emptyVersions,
        loadError: event.failure,
        saveError: null,
        refreshError: null,
        notice: null,
        loadMs: event.elapsedMs,
      };
    case "edit":
      if (!state.form) return state;
      return { ...state, form: event.form, notice: null };
    case "saving":
      return {
        ...state,
        phase: "saving",
        saveError: null,
        refreshError: null,
        notice: null,
      };
    case "save-unchanged":
      return {
        ...state,
        phase: "ready",
        notice: { tone: "info", title: "Nenhuma alteração para salvar" },
      };
    case "save-fail":
      return {
        ...state,
        phase: "ready",
        saveError: event.failure,
        refreshError: null,
        notice: null,
      };
    case "save-partial": {
      const notes = state.form?.notes ?? "";
      const baselineNotes = state.baseline?.notes ?? "";
      return {
        ...state,
        phase: "ready",
        person: { ...(state.person ?? event.person), ...event.person },
        form: { ...toEditable(event.person, notes), notes },
        baseline: {
          ...toEditable(event.person, baselineNotes),
          notes: baselineNotes,
        },
        versions: {
          ...state.versions,
          personUpdatedAt:
            event.person.updatedAt ?? state.versions.personUpdatedAt,
        },
        saveError: event.failure,
        refreshError: null,
        notice: null,
      };
    }
    case "save-ok":
      if (!event.person) {
        return {
          ...state,
          phase: "reopening",
          saveError: null,
          refreshError: null,
          notice: null,
        };
      }
      return {
        ...state,
        phase: "reopening",
        person: { ...(state.person ?? event.person), ...event.person },
        form: toEditable(event.person, state.form?.notes ?? ""),
        baseline: toEditable(event.person, state.baseline?.notes ?? ""),
        versions: {
          ...state.versions,
          personUpdatedAt:
            event.person.updatedAt ?? state.versions.personUpdatedAt,
        },
        saveError: null,
        refreshError: null,
        notice: null,
      };
    case "reopening":
      return { ...state, phase: "reopening", refreshError: null, notice: null };
    case "reopen-ok": {
      const saved = event.context === "after-save";
      const notice: DossierNotice = {
        tone: "success",
        title: saved ? "Ficha salva" : "Ficha atualizada",
        detail:
          saved && (state.person?.dedupeAlerts?.length ?? 0) > 0
            ? "Existe outro cadastro com o mesmo nome. Confira os dados se precisar distinguir as pessoas."
            : undefined,
      };
      const next = applyLoaded(
        event.data,
        state.loadMs ?? event.elapsedMs,
        notice,
        event.context === "after-save" ? event.elapsedMs : state.saveMs,
      );
      return next;
    }
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
