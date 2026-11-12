import type { ObservabilityRuntime } from "./config";
import { JsonLogger } from "./json-logger";
import { MetricsRegistry } from "./metrics";
import { isQuietRoute, isReadinessRoute, normalizeRoute } from "./route";

export function levelForStatus(status: number): "info" | "warn" | "error" {
  if (status >= 500) return "error";
  if (status === 401 || status === 403 || status === 429) return "warn";
  return "info";
}

export interface HttpObservation {
  method: string;
  url: string;
  status: number;
  durationMs: number;
  requestId: string;
  code?: string;
  cause?: string;
  ipHash?: string;
}

/**
 * Um registro por resposta. Rota quieta com sucesso não escreve linha
 * (healthcheck não enche o disco). Corpo de requisição não é parâmetro.
 */
export function emitHttpObservation(
  logger: JsonLogger,
  metrics: MetricsRegistry,
  runtime: ObservabilityRuntime,
  observation: HttpObservation,
): void {
  const route = normalizeRoute(observation.url);
  if (route === "/internal/observability/metrics" && observation.status === 404) {
    metrics.recordMetricsDenied();
    return;
  }
  if (isReadinessRoute(route)) metrics.recordReadiness(observation.status < 500);
  else if (!isQuietRoute(route)) metrics.recordRequest(observation.status, observation.durationMs);
  if (isQuietRoute(route) && observation.status < 400) return;
  logger.write({
    level: levelForStatus(observation.status),
    event: "http.access",
    requestId: observation.requestId,
    method: observation.method.toUpperCase(),
    route,
    status: observation.status,
    durationMs: observation.durationMs,
    code: observation.code,
    cause: observation.cause,
    ipHash: observation.ipHash,
    backend: runtime.backend,
  });
}
