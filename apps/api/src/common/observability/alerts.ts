import type { AlertThresholds, RateLimitBackend } from "./config";
import type { MetricsSnapshot } from "./metrics";

export interface Alert {
  severity: "warn" | "critical";
  code: string;
  message: string;
}

export interface AlertInput {
  snapshot: MetricsSnapshot;
  thresholds: AlertThresholds;
  backend: RateLimitBackend;
  expectSharedStore: boolean;
  fallback: boolean;
}

/** Sinais do próprio processo. Não chama serviço externo nem inclui dado pessoal. */
export function evaluateAlerts(input: AlertInput): Alert[] {
  const alerts: Alert[] = [];
  const { snapshot, thresholds } = input;
  if (
    snapshot.latencyMs.p95 != null
    && snapshot.requests >= thresholds.minRequests
    && snapshot.latencyMs.p95 > thresholds.p95Ms
  ) {
    alerts.push({
      severity: "warn",
      code: "LATENCY_P95",
      message: "Latência p95 acima do limite operacional",
    });
  }
  if (snapshot.requests >= thresholds.minRequests && snapshot.http5xx.ratio > thresholds.errorRatio) {
    alerts.push({
      severity: "critical",
      code: "HTTP_5XX",
      message: "Taxa de erros 5xx acima do limite operacional",
    });
  }
  if (snapshot.http401.perMinute > thresholds.perMinute401) {
    alerts.push({ severity: "warn", code: "HTTP_401", message: "Volume de 401 acima do limite operacional" });
  }
  if (snapshot.http403.perMinute > thresholds.perMinute403) {
    alerts.push({ severity: "warn", code: "HTTP_403", message: "Volume de 403 acima do limite operacional" });
  }
  if (snapshot.http429.perMinute > thresholds.perMinute429) {
    alerts.push({ severity: "warn", code: "HTTP_429", message: "Volume de 429 acima do limite operacional" });
  }
  if (snapshot.readiness.lastOk === false) {
    alerts.push({
      severity: "critical",
      code: "NOT_READY",
      message: "A última verificação de readiness falhou",
    });
  }
  if (input.expectSharedStore && input.backend !== "redis") {
    alerts.push({
      severity: "critical",
      code: "RATE_LIMIT_NOT_SHARED",
      message: "Rate limit em memória não protege várias instâncias. Serverless exige store compartilhado.",
    });
  }
  if (input.fallback) {
    alerts.push({
      severity: "warn",
      code: "RATE_LIMIT_MEMORY_FALLBACK",
      message: "Redis não foi injetado; este processo caiu para a memória local.",
    });
  }
  return alerts;
}

export function hasCriticalAlert(alerts: readonly Alert[]): boolean {
  return alerts.some((alert) => alert.severity === "critical");
}
