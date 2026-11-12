import {
  Module,
  type DynamicModule,
  type Type,
} from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core";

import { AccessLogInterceptor } from "./access-log.interceptor";
import { loadObservabilityConfig, type ObservabilityConfig, type ObservabilityRuntime } from "./config";
import { CorrelationMiddleware } from "./correlation.middleware";
import { ObservabilityExceptionFilter } from "./exception.filter";
import { JsonLogger, type LogStream } from "./json-logger";
import { MetricsRegistry } from "./metrics";
import { ObservabilityMetricsController } from "./metrics.controller";
import { createRateLimitStore, RateLimiter, type RateLimitRedisClient, type RateLimitStore } from "./rate-limit";
import { ObservabilityRateLimitMiddleware } from "./rate-limit.middleware";
import { ObservabilityReadyController, type ReadinessProbe } from "./readiness.controller";
import {
  LOG_STREAM,
  OBSERVABILITY_CONFIG,
  OBSERVABILITY_RUNTIME,
  RATE_LIMIT_STORE,
  READINESS_PROBE,
} from "./tokens";
export interface ObservabilityModuleOptions {
  env?: NodeJS.ProcessEnv;
  redis?: RateLimitRedisClient;
  probe?: ReadinessProbe;
  stream?: LogStream;
}

/**
 * Não registra middleware sozinho. O módulo raiz chama
 * `applyObservabilityWiring` quando `OBSERVABILITY_WIRE_MIDDLEWARE=1`.
 */
@Module({})
export class ObservabilityModule {
  static forRoot(options: ObservabilityModuleOptions = {}): DynamicModule {
    const env = options.env ?? process.env;
    const config = loadObservabilityConfig(env);
    const created = createRateLimitStore(config.rateLimit.backend, options.redis);
    const runtime: ObservabilityRuntime = {
      config,
      backend: created.backend,
      fallback: created.fallback,
    };
    const installGlobals = env.OBSERVABILITY_INSTALL_GLOBALS === "1";
    const controllers: Type[] = [ObservabilityMetricsController];
    if (options.probe) controllers.push(ObservabilityReadyController);
    return {
      module: ObservabilityModule,
      controllers,
      providers: [
        { provide: OBSERVABILITY_CONFIG, useValue: config },
        { provide: OBSERVABILITY_RUNTIME, useValue: runtime },
        { provide: LOG_STREAM, useValue: options.stream ?? process.stdout },
        { provide: RATE_LIMIT_STORE, useValue: created.store },
        {
          provide: READINESS_PROBE,
          useValue: options.probe ?? { async check(): Promise<void> { /* sem probe o controller não sobe */ } },
        },
        {
          provide: JsonLogger,
          useFactory: (cfg: ObservabilityConfig, stream: LogStream) => new JsonLogger(cfg, stream),
          inject: [OBSERVABILITY_CONFIG, LOG_STREAM],
        },
        { provide: MetricsRegistry, useFactory: () => new MetricsRegistry() },
        {
          provide: RateLimiter,
          useFactory: (store: RateLimitStore) => new RateLimiter(store),
          inject: [RATE_LIMIT_STORE],
        },
        CorrelationMiddleware,
        ObservabilityRateLimitMiddleware,
        AccessLogInterceptor,
        ObservabilityExceptionFilter,
        ...(installGlobals
          ? [
              { provide: APP_FILTER, useExisting: ObservabilityExceptionFilter },
              { provide: APP_INTERCEPTOR, useExisting: AccessLogInterceptor },
            ]
          : []),
      ],
      exports: [
        JsonLogger,
        MetricsRegistry,
        RateLimiter,
        ObservabilityExceptionFilter,
        AccessLogInterceptor,
        CorrelationMiddleware,
        ObservabilityRateLimitMiddleware,
        OBSERVABILITY_CONFIG,
        OBSERVABILITY_RUNTIME,
      ],
    };
  }
}
