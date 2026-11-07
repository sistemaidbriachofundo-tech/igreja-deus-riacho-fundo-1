/** Referência pública a um fato oficial (sem PII). */
export type ViviKnowledgeSourceRef = {
  kind: "ministry" | "event" | "cms";
  id: string;
  slug: string;
  title: string;
};

export type ViviKnowledgeIntent =
  | "schedule"
  | "leadership"
  | "events"
  | "ministries"
  | "cms"
  | "general";

/**
 * Pacote de retrieval estruturado (sem embeddings/RAG).
 * Refresh: leitura live do Postgres a cada request (`live-db-on-each-request`).
 * Publicar no CMS (status PUBLICADO) passa a valer no request seguinte.
 */
export type InstitutionalKnowledgePack = {
  churchId: string;
  churchName: string;
  retrievedAt: string;
  refreshPolicy: "live-db-on-each-request";
  intent: ViviKnowledgeIntent;
  sources: ViviKnowledgeSourceRef[];
  /** Texto compacto injetado no system prompt. */
  factsText: string;
  /** Pedido factual (horário/líder/evento) sem hit oficial. */
  missingOfficialData: boolean;
};
