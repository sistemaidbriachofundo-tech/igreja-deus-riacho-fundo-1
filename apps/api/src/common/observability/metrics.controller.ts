import { Controller, Get, Header, Headers, Inject, NotFoundException, SetMetadata } from "@nestjs/common";

import { evaluateAlerts } from "./alerts";
import type { ObservabilityRuntime } from "./config";
import { metricsTokenMatches } from "./metrics-auth";
import { MetricsRegistry } from "./metrics";
import { rateLimitTopology } from "./rate-limit";
import { OBSERVABILITY_RUNTIME } from "./tokens";

/** Mesma chave lida pelo JwtAuthGuard. Mantida aqui para não acoplar o módulo a auth. */
export const PublicRoute = () => SetMetadata("isPublic", true);

@PublicRoute()
@Controller("internal/observability")
export class ObservabilityMetricsController {
  constructor(
    private readonly metrics: MetricsRegistry,
    @Inject(OBSERVABILITY_RUNTIME) private readonly runtime: ObservabilityRuntime,
  ) {}

  @Get("metrics")
  @Header("Cache-Control", "no-store")
  getMetrics(@Headers("x-observability-token") token?: string | string[]) {
    if (!metricsTokenMatches(this.runtime.config.metricsToken, token)) {
      throw new NotFoundException({
        statusCode: 404,
        message: "Não encontrado",
        code: "NOT_FOUND",
      });
    }
    const snapshot = this.metrics.snapshot();
    return {
      service: "api",
      stage: this.runtime.config.stage,
      version: this.runtime.config.version,
      logLevel: this.runtime.config.logLevel,
      rateLimit: {
        backend: this.runtime.backend,
        fallback: this.runtime.fallback,
        ...rateLimitTopology(this.runtime.backend, this.runtime.config.instances),
      },
      window: snapshot,
      alerts: evaluateAlerts({
        snapshot,
        thresholds: this.runtime.config.alerts,
        backend: this.runtime.backend,
        expectSharedStore: this.runtime.config.expectSharedStore,
        fallback: this.runtime.fallback,
      }),
    };
  }
}
