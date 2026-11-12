import { Controller, Get, Inject, Req, Res, SetMetadata } from "@nestjs/common";
import type { Response } from "express";

import type { ObservabilityRuntime } from "./config";
import type { HttpRequestView } from "./http-types";
import { JsonLogger } from "./json-logger";
import { MetricsRegistry } from "./metrics";
import { safeCause, toPublicReadiness } from "./public-error";
import { requestIdOf } from "./request-context";
import { OBSERVABILITY_RUNTIME, READINESS_PROBE } from "./tokens";

export interface ReadinessProbe {
  check(): Promise<void>;
}

/** Probe público sem JWT. O corpo não leva banco, host nem erro interno. */
export const PublicRoute = () => SetMetadata("isPublic", true);

@PublicRoute()
@Controller("internal/observability")
export class ObservabilityReadyController {
  constructor(
    @Inject(READINESS_PROBE) private readonly probe: ReadinessProbe,
    private readonly logger: JsonLogger,
    private readonly metrics: MetricsRegistry,
    @Inject(OBSERVABILITY_RUNTIME) private readonly runtime: ObservabilityRuntime,
  ) {}

  @Get("ready")
  async ready(@Req() req: HttpRequestView, @Res() res: Response): Promise<void> {
    const requestId = requestIdOf(req, res);
    res.setHeader("X-Request-Id", requestId);
    res.setHeader("Cache-Control", "no-store");
    try {
      await this.probe.check();
      this.finish(res, true);
    } catch (error) {
      this.logger.write({
        level: "warn",
        event: "readiness.failed",
        requestId,
        code: "NOT_READY",
        cause: safeCause(error, this.runtime.config.logStack),
        method: "GET",
        route: "/internal/observability/ready",
        status: 503,
        backend: this.runtime.backend,
      });
      this.finish(res, false);
    }
  }

  private finish(res: Response, ok: boolean): void {
    this.metrics.recordReadiness(ok);
    res.locals.obsLogged = true;
    res.status(ok ? 200 : 503).json(toPublicReadiness(ok));
  }
}
