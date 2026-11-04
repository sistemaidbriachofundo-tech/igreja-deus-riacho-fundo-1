/** Identidade estável da pessoa no domínio (DAS). */
export type PersonId = string;

/** Escopo multi-congregação. */
export type OrganizationId = string;
export type ChurchId = string;

export interface HealthStatus {
  status: "ok" | "degraded" | "down";
  service: string;
  timestamp: string;
}

export const APP_NAME = "Igreja de Deus — Riacho Fundo I";
export const APP_SLUG = "igreja-deus-riacho-fundo-1";

export function createHealthStatus(
  service: string,
  status: HealthStatus["status"] = "ok",
): HealthStatus {
  return {
    status,
    service,
    timestamp: new Date().toISOString(),
  };
}
