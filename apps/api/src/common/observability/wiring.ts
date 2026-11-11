import { RequestMethod, type MiddlewareConsumer } from "@nestjs/common";

import { CorrelationMiddleware } from "./correlation.middleware";
import type { ObservabilityRuntime } from "./config";
import { ObservabilityRateLimitMiddleware } from "./rate-limit.middleware";

/** Nest 11: curinga nomeado. O integrador liga isto com OBSERVABILITY_WIRE_MIDDLEWARE=1. */
export const ALL_ROUTES = "{*path}";

/**
 * Não altera o AppModule sozinho. Com a flag desligada, esta função não
 * registra middleware — o limite antigo continua até a revisão do #189.
 */
export function applyObservabilityWiring(
  consumer: MiddlewareConsumer,
  runtime: ObservabilityRuntime | undefined,
): void {
  if (!runtime?.config.wireMiddleware) return;
  consumer.apply(CorrelationMiddleware).forRoutes(ALL_ROUTES);
  const routes = runtime.config.rateLimit.rules.map((rule) => ({
    path: rule.path.replace(/^\//, ""),
    method: nestMethod(rule.method),
  }));
  consumer.apply(ObservabilityRateLimitMiddleware).forRoutes(...routes);
}

function nestMethod(method: string): RequestMethod {
  switch (method.toUpperCase()) {
    case "GET":
      return RequestMethod.GET;
    case "POST":
      return RequestMethod.POST;
    case "PUT":
      return RequestMethod.PUT;
    case "PATCH":
      return RequestMethod.PATCH;
    case "DELETE":
      return RequestMethod.DELETE;
    default:
      return RequestMethod.ALL;
  }
}
