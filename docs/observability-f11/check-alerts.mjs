#!/usr/bin/env node
/**
 * Cron local do VPS. Não envia o snapshot para fora.
 * OBSERVABILITY_METRICS_URL padrão: http://127.0.0.1:3001/internal/observability/metrics
 * Sai 1 se houver alerta critical, 2 se o endpoint não responder.
 */
const url = process.env.OBSERVABILITY_METRICS_URL
  ?? "http://127.0.0.1:3001/internal/observability/metrics";
const token = process.env.OBSERVABILITY_METRICS_TOKEN ?? "";
if (token.length < 16) {
  console.error("OBSERVABILITY_METRICS_TOKEN ausente ou curto demais");
  process.exit(2);
}

const response = await fetch(url, {
  headers: { "X-Observability-Token": token, Accept: "application/json" },
});
if (!response.ok) {
  console.error(`métricas indisponíveis: HTTP ${response.status}`);
  process.exit(2);
}
const body = await response.json();
const alerts = Array.isArray(body.alerts) ? body.alerts : [];
for (const alert of alerts) {
  console.log(`${alert.severity ?? "warn"} ${alert.code ?? "ALERT"} ${alert.message ?? ""}`);
}
if (alerts.some((alert) => alert.severity === "critical")) process.exit(1);
