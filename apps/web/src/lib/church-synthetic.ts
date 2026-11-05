/**
 * Dataset sintético para homologação de UI no GitHub Pages.
 * Não contém pessoas reais e não deve ser interpretado como banco da igreja.
 * As regras definitivas de autorização e admissão pertencem à API NestJS.
 */
export type MemberStatus = "ACTIVE" | "VISITOR" | "PENDING_ADMISSION" | "INACTIVE";
export type AdmissionStage = "DOCUMENTS" | "SECRETARIA" | "PASTOR" | "COMPLETE";
export type CardStatus = "NONE" | "ACTIVE" | "REVOKED";
export type Modality = "BATISMO" | "TRANSFERENCIA" | "RECONCILIACAO" | "OUTRO";
export type Member = {
  id: string;
  name: string;
  email: string;
  family: string;
  phone: string;
  joinedAt: string;
  status: MemberStatus;
  stage: AdmissionStage;
  modality: Modality;
  card: CardStatus;
  ministry: string;
  notes: string;
};
export type MemberInput = Pick<Member, "name" | "email" | "family" | "phone">;
export type OperationResult = { ok: true; members: Member[] } | { ok: false; message: string };

export const SYNTHETIC_STORE_KEY = "idbrf_gerencial_sintetico_v1";
export const STATUS_LABEL: Record<MemberStatus, string> = {
  ACTIVE: "Ativo", VISITOR: "Visitante", PENDING_ADMISSION: "Em admissão", INACTIVE: "Inativo",
};
export const STAGE_LABEL: Record<AdmissionStage, string> = {
  DOCUMENTS: "Documentação", SECRETARIA: "Secretaria", PASTOR: "Aprovação pastoral", COMPLETE: "Concluído",
};
export const MODALITY_LABEL: Record<Modality, string> = {
  BATISMO: "Batismo", TRANSFERENCIA: "Transferência", RECONCILIACAO: "Reconciliação", OUTRO: "Outro",
};

const people: [string, string, string, MemberStatus, AdmissionStage, CardStatus, string, Modality][] = [
  ["Marina Oliveira", "Oliveira", "Louvor", "ACTIVE", "COMPLETE", "ACTIVE", "2025-11-12", "BATISMO"],
  ["Rafael Martins", "Martins", "Recepção", "ACTIVE", "COMPLETE", "ACTIVE", "2024-07-04", "TRANSFERENCIA"],
  ["Beatriz Santos", "Santos", "Juventude", "ACTIVE", "COMPLETE", "ACTIVE", "2025-08-18", "BATISMO"],
  ["André Ferreira", "Ferreira", "Diaconia", "ACTIVE", "COMPLETE", "ACTIVE", "2023-03-09", "BATISMO"],
  ["Camila Rodrigues", "Rodrigues", "Infantil", "ACTIVE", "COMPLETE", "ACTIVE", "2024-09-21", "TRANSFERENCIA"],
  ["Daniel Costa", "Costa", "Louvor", "ACTIVE", "COMPLETE", "NONE", "2025-12-03", "BATISMO"],
  ["Patrícia Almeida", "Almeida", "Recepção", "ACTIVE", "COMPLETE", "ACTIVE", "2023-05-14", "RECONCILIACAO"],
  ["Felipe Barbosa", "Barbosa", "Juventude", "ACTIVE", "COMPLETE", "NONE", "2025-10-28", "BATISMO"],
  ["Luana Pereira", "Pereira", "Infantil", "ACTIVE", "COMPLETE", "ACTIVE", "2024-02-15", "TRANSFERENCIA"],
  ["Gabriel Nascimento", "Nascimento", "Música", "ACTIVE", "COMPLETE", "NONE", "2026-01-18", "BATISMO"],
  ["Priscila Ribeiro", "Ribeiro", "Intercessão", "ACTIVE", "COMPLETE", "NONE", "2026-02-26", "RECONCILIACAO"],
  ["Tiago Mendes", "Mendes", "A definir", "PENDING_ADMISSION", "PASTOR", "NONE", "2026-10-11", "BATISMO"],
  ["Elisa Carvalho", "Carvalho", "A definir", "PENDING_ADMISSION", "SECRETARIA", "NONE", "2026-10-21", "TRANSFERENCIA"],
  ["João Pedro Lima", "Lima", "A definir", "PENDING_ADMISSION", "DOCUMENTS", "NONE", "2026-10-27", "BATISMO"],
  ["Renata Gomes", "Gomes", "A definir", "PENDING_ADMISSION", "PASTOR", "NONE", "2026-11-01", "RECONCILIACAO"],
  ["Lucas Rocha", "Rocha", "A definir", "VISITOR", "DOCUMENTS", "NONE", "2026-11-03", "OUTRO"],
  ["Helena Castro", "Castro", "A definir", "VISITOR", "DOCUMENTS", "NONE", "2026-10-30", "OUTRO"],
  ["Marcelo Teixeira", "Teixeira", "A definir", "VISITOR", "DOCUMENTS", "NONE", "2026-10-20", "OUTRO"],
  ["Natália Dias", "Dias", "A definir", "INACTIVE", "COMPLETE", "REVOKED", "2022-01-19", "BATISMO"],
];

export function initialMembers(): Member[] {
  return people.map(([name, family, ministry, status, stage, card, joinedAt, modality], i) => ({
    id: "RF1-" + String(i + 1).padStart(4, "0"),
    name,
    email: "pessoa" + String(i + 1).padStart(2, "0") + "@example.test",
    phone: "Não informado",
    family: "Família " + family,
    ministry,
    status,
    stage,
    card,
    joinedAt,
    modality,
    notes: "",
  }));
}

const statuses = Object.keys(STATUS_LABEL);
const stages = Object.keys(STAGE_LABEL);
const cards = ["NONE", "ACTIVE", "REVOKED"];
const modalities = Object.keys(MODALITY_LABEL);
export function isMembersDataset(value: unknown): value is Member[] {
  if (!Array.isArray(value) || value.length > 500) return false;
  const ids = new Set<string>();
  return value.every((m) => {
    if (!m || typeof m !== "object") return false;
    const p = m as Record<string, unknown>;
    if (typeof p.id !== "string" || !p.id || ids.has(p.id)) return false;
    ids.add(p.id);
    return ["name", "email", "family", "phone", "joinedAt", "ministry", "notes"].every((k) => typeof p[k] === "string") &&
      statuses.includes(p.status as string) && stages.includes(p.stage as string) &&
      cards.includes(p.card as string) && modalities.includes(p.modality as string);
  });
}
export function summarize(members: readonly Member[]) {
  return {
    total: members.length,
    active: members.filter((m) => m.status === "ACTIVE").length,
    pending: members.filter((m) => m.status === "PENDING_ADMISSION").length,
    visitors: members.filter((m) => m.status === "VISITOR").length,
    issued: members.filter((m) => m.card === "ACTIVE").length,
    families: new Set(members.map((m) => m.family).filter(Boolean)).size,
  };
}
export function filterMembers(members: readonly Member[], query: string, status = "ALL"): Member[] {
  const q = query.trim().toLocaleLowerCase("pt-BR");
  return members.filter((m) => (status === "ALL" || m.status === status) &&
    [m.name, m.email, m.family, m.ministry].join(" ").toLocaleLowerCase("pt-BR").includes(q));
}
export function createMember(members: readonly Member[], input: MemberInput, id: string): OperationResult {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (name.length < 3 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, message: "Informe nome completo e e-mail válido." };
  }
  if (!email.endsWith("@example.test")) {
    return { ok: false, message: "Este ambiente aceita somente e-mails sintéticos @example.test." };
  }
  if (members.some((m) => m.email.toLowerCase() === email || m.id === id)) {
    return { ok: false, message: "Pessoa ou identificador já cadastrado nesta base." };
  }
  return {
    ok: true,
    members: [...members, {
      id, name, email, family: input.family.trim() || "Família não vinculada",
      phone: input.phone.trim() || "Não informado", joinedAt: "2026-11-04",
      status: "VISITOR", stage: "DOCUMENTS", card: "NONE", modality: "OUTRO", ministry: "A definir", notes: "",
    }],
  };
}
export function openAdmission(members: readonly Member[], id: string, modality: Modality): OperationResult {
  const p = members.find((m) => m.id === id);
  if (!p || p.status !== "VISITOR") return { ok: false, message: "A admissão somente pode começar para visitantes." };
  return { ok: true, members: members.map((m) => m.id === id ? { ...m, status: "PENDING_ADMISSION", stage: "DOCUMENTS", modality } : m) };
}
export function advanceAdmission(members: readonly Member[], id: string, responsible: "SECRETARIA" | "PASTOR"): OperationResult {
  const p = members.find((m) => m.id === id);
  if (!p || p.status !== "PENDING_ADMISSION") return { ok: false, message: "Não há processo de admissão em andamento para esta pessoa." };
  if (p.stage === "PASTOR") {
    if (responsible !== "PASTOR") return { ok: false, message: "Esta decisão está reservada à aprovação pastoral." };
    return { ok: true, members: members.map((m) => m.id === id ? { ...m, status: "ACTIVE", stage: "COMPLETE" } : m) };
  }
  if (responsible !== "SECRETARIA") return { ok: false, message: "Esta etapa exige conferência da Secretaria." };
  const next: AdmissionStage = p.stage === "DOCUMENTS" ? "SECRETARIA" : "PASTOR";
  return { ok: true, members: members.map((m) => m.id === id ? { ...m, stage: next } : m) };
}
export function updateMemberNotes(members: readonly Member[], id: string, notes: string): OperationResult {
  if (!members.some((m) => m.id === id)) return { ok: false, message: "Pessoa não encontrada." };
  return { ok: true, members: members.map((m) => m.id === id ? { ...m, notes: notes.trim().slice(0, 500) } : m) };
}
export function setMemberCard(members: readonly Member[], id: string, action: "ISSUE" | "REVOKE"): OperationResult {
  const p = members.find((m) => m.id === id);
  if (!p) return { ok: false, message: "Pessoa não encontrada." };
  if (action === "ISSUE" && (p.status !== "ACTIVE" || p.stage !== "COMPLETE")) {
    return { ok: false, message: "É obrigatório concluir a aprovação pastoral antes da emissão." };
  }
  if (action === "ISSUE" && p.card === "ACTIVE") return { ok: false, message: "Carteirinha já está ativa." };
  if (action === "REVOKE" && p.card !== "ACTIVE") return { ok: false, message: "Não existe carteirinha ativa para revogar." };
  return { ok: true, members: members.map((m) => m.id === id ? { ...m, card: action === "ISSUE" ? "ACTIVE" : "REVOKED" } : m) };
}
