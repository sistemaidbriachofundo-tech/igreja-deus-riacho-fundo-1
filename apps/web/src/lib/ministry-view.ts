/**
 * Linguagem e endereços do painel de ministérios.
 * O acesso continua decidido pela API. Esta matriz só descreve o que a tela espera.
 */

import type { DeskReady, FormalMember, FormalRole, FormalStatus, MinistryOption } from "./ministry-desk";

export const MINISTRY_TABS = [
  { id: "visao", label: "Visão geral" },
  { id: "integrantes", label: "Integrantes" },
  { id: "escalas", label: "Escalas" },
  { id: "atividades", label: "Atividades" },
  { id: "recursos", label: "Gestão e caixa" },
] as const;

export type MinistryTabId = (typeof MINISTRY_TABS)[number]["id"];

/** Os oito papéis do sistema. Tesouraria, membro e edição de site não herdam a equipe. */
export const MINISTRY_PERSONAS = [
  "PLATFORM_ADMIN",
  "SECRETARIA",
  "PASTOR",
  "TESOURARIA",
  "LIDER_MINISTERIO",
  "EDITOR_SITE",
  "PUBLICADOR_SITE",
  "MEMBRO",
] as const;

const DESK_ROLES = ["PLATFORM_ADMIN", "SECRETARIA", "PASTOR", "LIDER_MINISTERIO"] as const;

export function ministryAccess(role: string, sameMinistry: boolean): "painel" | "403" {
  if (!(DESK_ROLES as readonly string[]).includes(role)) return "403";
  if (role === "LIDER_MINISTERIO" && !sameMinistry) return "403";
  return "painel";
}

export function isMinistryTab(value: string | null | undefined): value is MinistryTabId {
  return MINISTRY_TABS.some((tab) => tab.id === value);
}

export function ministryPanelTitle(ministry: Pick<MinistryOption, "name" | "slug">): string {
  const slug = (ministry.slug ?? "").toLowerCase();
  const name = ministry.name.trim();
  if (slug === "homens" || slug === "homens-de-acao" || /^homens\b/i.test(name)) return "Homens";
  return name || "Ministério";
}

const ROLE_LABEL: Record<FormalRole, string> = {
  LIDER: "Liderança",
  COORDENADOR: "Coordenação",
  INTEGRANTE: "Integrante",
  APOIO: "Apoio",
};

const STATUS_LABEL: Record<FormalStatus, string> = {
  ATIVO: "Ativo",
  CONVIDADO: "Convidado",
  PAUSADO: "Pausado",
  ENCERRADO: "Encerrado",
};

export function roleLabel(role: FormalRole): string {
  return ROLE_LABEL[role];
}

export function memberStatusLabel(status: FormalStatus): string {
  return STATUS_LABEL[status];
}

export function activeFormalMembers(members: readonly FormalMember[]): FormalMember[] {
  return members.filter((member) => member.status !== "ENCERRADO");
}

export function visibleSchedule(desk: DeskReady): string | null {
  if (desk.agenda.kind === "denied") return null;
  const fromProfile = desk.ministry.scheduleText?.trim() || null;
  return desk.agenda.scheduleText || fromProfile;
}

/** A URL canônica usa ministry; links antigos com ministerio continuam válidos. */
export function parseMinistryRoute(search: string): { ministryId?: string; tab: MinistryTabId; escalaId?: string } {
  const params = new URLSearchParams(search);
  const ministryId = params.get("ministry")?.trim() || params.get("ministerio")?.trim() || undefined;
  const tab = params.get("aba");
  const escalaId = params.get("escala")?.trim() || undefined;
  return { ministryId, tab: isMinistryTab(tab) ? tab : "visao", escalaId };
}

export function ministryHref(ministryId: string, tab: MinistryTabId = "visao", escalaId?: string): string {
  const params = new URLSearchParams();
  params.set("ministry", ministryId);
  params.set("aba", tab);
  if (escalaId) params.set("escala", escalaId);
  return `/app/ministerios/?${params.toString()}`;
}

export function meuEspacoHref(): string {
  return "/app/servir/meu-espaco/";
}

/** Atalho só quando a escala daquele ministério já tem página própria. */
export function servingShortcut(slug: string | undefined): { href: string; label: string } | null {
  if (slug === "louvor" || slug === "louvor-demo") {
    return { href: "/app/servir/louvor/", label: "Abrir escalas de Louvor" };
  }
  if (slug === "atmosfera") {
    return { href: "/app/servir/atmosfera/", label: "Abrir escalas de Atmosfera" };
  }
  return null;
}

export function escalaStatusLabel(status: string): string {
  if (status === "DRAFT") return "Rascunho";
  if (status === "PUBLISHED") return "Publicada";
  if (status === "CLOSED") return "Encerrada";
  return "Em revisão";
}

export function activityStatusLabel(status: string): string {
  if (status === "DRAFT") return "Rascunho";
  if (status === "PUBLISHED") return "Publicada";
  if (status === "CANCELLED") return "Cancelada";
  if (status === "ARCHIVED") return "Arquivada";
  return "Em revisão";
}

export function formatChurchWhen(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "Data a confirmar";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** A resposta técnica não entra na tela. O efeito para a pessoa é o que fica. */
export function humanWriteNotice(code: string, applied: boolean, fallback: string): string {
  if (applied) return fallback;
  if (code.includes("FORBIDDEN")) return "Esta conta não altera este ministério.";
  if (code.includes("ALREADY_ACTIVE")) return "Esta pessoa já integra este ministério.";
  if (code.includes("ALREADY_ENDED")) return "Este vínculo já está encerrado.";
  if (code.includes("WITHOUT_PERSON")) {
    return "Este interesse ainda não está ligado a uma pessoa cadastrada.";
  }
  if (code.includes("NOT_IN_SCOPE") || code.includes("NOT_FOUND")) {
    return "Não encontramos este registro neste ministério.";
  }
  if (code.includes("SCHEMA") || code.includes("BLOCKED") || code.includes("CONVERSION")) {
    return "O vínculo formal ainda não pode ser gravado. Nenhuma pessoa foi incluída.";
  }
  if (/501|schema|endpoint|tabela/i.test(fallback)) {
    return "O vínculo formal ainda não pode ser gravado. Nenhuma pessoa foi incluída.";
  }
  return fallback;
}

const STAGE_LABEL: Record<string, string> = {
  INTERESSE: "Interesse recebido",
  AVALIACAO: "Em avaliação",
  APROVACAO: "Em aprovação",
  EQUIPE: "Etapa de equipe do voluntariado",
  DISPONIBILIDADE: "Disponibilidade informada",
  ESCALA: "Encaminhado à escala",
};

export function interestStageLabel(stage: string): string {
  return STAGE_LABEL[stage] ?? "Interesse recebido";
}
