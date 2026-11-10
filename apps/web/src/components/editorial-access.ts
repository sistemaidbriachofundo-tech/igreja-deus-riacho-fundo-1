export type EditorialStatus = "RASCUNHO" | "REVISAO" | "APROVADO" | "PUBLICADO" | "ARQUIVADO";

const transitions: Record<EditorialStatus, EditorialStatus[]> = {
  RASCUNHO: ["REVISAO", "ARQUIVADO"],
  REVISAO: ["RASCUNHO", "APROVADO", "ARQUIVADO"],
  APROVADO: ["REVISAO", "PUBLICADO", "ARQUIVADO"],
  PUBLICADO: ["REVISAO", "ARQUIVADO"],
  ARQUIVADO: ["RASCUNHO"],
};

/** O editor prepara. Aprovar e publicar exigem o publicador. */
export function advanceOptions(status: EditorialStatus, canPublish: boolean): EditorialStatus[] {
  return transitions[status].filter((next) =>
    canPublish || (next !== "APROVADO" && next !== "PUBLICADO" && status !== "PUBLICADO"),
  );
}

export function mayPublishRecord(canPublish: boolean, status: string): boolean {
  return canPublish && status !== "PUBLISHED" && status !== "PUBLICADO";
}

export function publishLabel(status: string): string {
  if (status === "PUBLISHED" || status === "PUBLICADO") return "Publicado";
  if (status === "DRAFT" || status === "RASCUNHO") return "Rascunho";
  if (status === "CANCELLED") return "Cancelado";
  if (status === "ARCHIVED" || status === "ARQUIVADO") return "Arquivado";
  return "Em preparação";
}

export const contentKindLabels = {
  NEWS: "Notícia",
  BANNER: "Destaque",
  HOME_BLOCK: "Bloco da página inicial",
  PAGE: "Página",
  MINISTRY_CONTENT: "Conteúdo de ministério",
} as const;
