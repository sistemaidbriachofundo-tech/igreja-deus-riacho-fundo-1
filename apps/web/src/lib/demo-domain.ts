/**
 * Regras PURAS da experiência demonstrativa F2.
 * Somente dados fictícios; NÃO representam validação de autorização do servidor.
 */
export type Role = "SECRETARIA" | "PASTOR" | "MEMBRO";
export type Tab = "painel" | "pessoas" | "admissoes" | "carteirinhas";
export type MembershipStatus = "VISITOR" | "PENDING_ADMISSION" | "ACTIVE";
export type Modality = "BATISMO" | "TRANSFERENCIA" | "RECONCILIACAO" | "OUTRO";
export type Step = "modality" | "documents" | "secretaria" | "pastor";
export type CredentialStatus = "NONE" | "ACTIVE" | "REVOKED";

export interface Person {
  id: string;
  name: string;
  email: string;
  household: string;
  status: MembershipStatus;
  modality: Modality | null;
  checklist: Record<Step, boolean>;
  credential: CredentialStatus;
  token: string;
}

export const KEY = "idbrf_f2_demo_2026_11";
export const STEP_ORDER: readonly Step[] = ["modality", "documents", "secretaria", "pastor"];
export const STEP_LABEL: Record<Step, string> = {
  modality: "Modalidade",
  documents: "Documentação",
  secretaria: "Conferência da Secretaria",
  pastor: "Aprovação pastoral",
};
export const ROLE_LABEL: Record<Role, string> = {
  SECRETARIA: "Secretaria",
  PASTOR: "Pastor",
  MEMBRO: "Membro",
};
export const STATUS_LABEL: Record<MembershipStatus, string> = {
  VISITOR: "Visitante",
  PENDING_ADMISSION: "Em admissão",
  ACTIVE: "Membro ativo",
};
export const MODALITY_LABEL: Record<Modality, string> = {
  BATISMO: "Batismo",
  TRANSFERENCIA: "Transferência",
  RECONCILIACAO: "Reconciliação",
  OUTRO: "Outro",
};

const complete: Record<Step, boolean> = { modality: true, documents: true, secretaria: true, pastor: true };
export const empty: Record<Step, boolean> = { modality: false, documents: false, secretaria: false, pastor: false };
const SEED: readonly Person[] = [
  { id: "p-001", name: "Ana Demo", email: "ana@example.test", household: "Família Demo", status: "ACTIVE", modality: "TRANSFERENCIA", checklist: { ...complete }, credential: "NONE", token: "" },
  { id: "p-002", name: "Bruno Demo", email: "bruno@example.test", household: "Família Demo", status: "ACTIVE", modality: "BATISMO", checklist: { ...complete }, credential: "ACTIVE", token: "IDBRF-DEMO-002" },
  { id: "p-003", name: "Carla Demo", email: "carla@example.test", household: "Família Exemplo", status: "VISITOR", modality: null, checklist: { ...empty }, credential: "NONE", token: "" },
  { id: "p-004", name: "Davi Demo", email: "davi@example.test", household: "Família Exemplo", status: "PENDING_ADMISSION", modality: "BATISMO", checklist: { modality: true, documents: true, secretaria: false, pastor: false }, credential: "NONE", token: "" },
];

export function seed(): Person[] {
  return SEED.map((p) => ({ ...p, checklist: { ...p.checklist } }));
}

export function nextStep(person: Person): Step | null {
  return STEP_ORDER.find((step) => !person.checklist[step]) ?? null;
}

export function isEligible(person: Person): boolean {
  return person.status === "ACTIVE" && STEP_ORDER.every((step) => person.checklist[step]);
}

export function selectVisible(people: readonly Person[], role: Role, search: string, ownId = "p-002"): Person[] {
  if (role === "MEMBRO") return people.filter((person) => person.id === ownId);
  const query = search.trim().toLocaleLowerCase("pt-BR");
  return people.filter((person) => [person.name, person.email, person.household].join(" ").toLocaleLowerCase("pt-BR").includes(query));
}

const statuses: MembershipStatus[] = ["VISITOR", "PENDING_ADMISSION", "ACTIVE"];
const credentials: CredentialStatus[] = ["NONE", "ACTIVE", "REVOKED"];
const modalities: Modality[] = ["BATISMO", "TRANSFERENCIA", "RECONCILIACAO", "OUTRO"];
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Valida o cache local completo, impedindo que dados malformados quebrem a demonstração. */
export function isPersonList(value: unknown): value is Person[] {
  return Array.isArray(value) && value.length <= 200 && value.every((p) => {
    if (!isRecord(p) || !isRecord(p.checklist)) return false;
    return typeof p.id === "string" && p.id.length > 0 &&
      typeof p.name === "string" && p.name.length > 0 &&
      typeof p.email === "string" && typeof p.household === "string" &&
      statuses.includes(p.status as MembershipStatus) &&
      (p.modality === null || modalities.includes(p.modality as Modality)) &&
      credentials.includes(p.credential as CredentialStatus) &&
      typeof p.token === "string" &&
      STEP_ORDER.every((step) => typeof (p.checklist as Record<string, unknown>)[step] === "boolean");
  });
}

export type DemoError = "ROLE_REQUIRED" | "INVALID_PERSON" | "DUPLICATE_EMAIL" | "INVALID_STATE" | "STEP_LOCKED" | "NOT_ELIGIBLE" | "CARD_NOT_ACTIVE" | "CARD_ALREADY_ACTIVE";
export type DemoResult<T> = { ok: true; value: T } | { ok: false; code: DemoError };

export function createVisitor(
  people: readonly Person[],
  role: Role,
  data: { name: string; email: string; household: string },
  id: string,
): DemoResult<Person[]> {
  if (role !== "SECRETARIA") return { ok: false, code: "ROLE_REQUIRED" };
  const name = data.name.trim();
  const email = data.email.trim().toLocaleLowerCase("pt-BR");
  if (!name || !id.trim() || !email.includes("@") && !!email) return { ok: false, code: "INVALID_PERSON" };
  if (people.some((p) => p.id === id)) return { ok: false, code: "INVALID_PERSON" };
  if (email && people.some((p) => p.email.toLocaleLowerCase("pt-BR") === email)) return { ok: false, code: "DUPLICATE_EMAIL" };
  const person: Person = {
    id, name, email, household: data.household.trim() || "Sem família vinculada",
    status: "VISITOR", modality: null, checklist: { ...empty }, credential: "NONE", token: "",
  };
  return { ok: true, value: [...people, person] };
}

export function beginAdmission(person: Person | undefined, role: Role, modality: Modality): DemoResult<Person> {
  if (role !== "SECRETARIA") return { ok: false, code: "ROLE_REQUIRED" };
  if (!person || person.status !== "VISITOR" || !modalities.includes(modality)) return { ok: false, code: "INVALID_STATE" };
  return { ok: true, value: { ...person, status: "PENDING_ADMISSION", modality, checklist: { ...empty, modality: true } } };
}

export function advanceAdmission(person: Person | undefined, role: Role, step: Step): DemoResult<Person> {
  if (!person || person.status !== "PENDING_ADMISSION") return { ok: false, code: "INVALID_STATE" };
  if (nextStep(person) !== step || step === "modality") return { ok: false, code: "STEP_LOCKED" };
  if (role !== (step === "pastor" ? "PASTOR" : "SECRETARIA")) return { ok: false, code: "ROLE_REQUIRED" };
  const checklist = { ...person.checklist, [step]: true };
  return {
    ok: true,
    value: { ...person, checklist, status: step === "pastor" ? "ACTIVE" : person.status },
  };
}

export function setCredential(person: Person | undefined, role: Role, value: "ACTIVE" | "REVOKED"): DemoResult<Person> {
  if (role !== "SECRETARIA") return { ok: false, code: "ROLE_REQUIRED" };
  if (!person) return { ok: false, code: "INVALID_PERSON" };
  if (value === "ACTIVE") {
    if (!isEligible(person)) return { ok: false, code: "NOT_ELIGIBLE" };
    if (person.credential === "ACTIVE") return { ok: false, code: "CARD_ALREADY_ACTIVE" };
    return { ok: true, value: { ...person, credential: "ACTIVE", token: "IDBRF-DEMO-" + person.id } };
  }
  if (person.credential !== "ACTIVE") return { ok: false, code: "CARD_NOT_ACTIVE" };
  return { ok: true, value: { ...person, credential: "REVOKED" } };
}
