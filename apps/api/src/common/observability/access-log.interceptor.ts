import { Inject, Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from "@nestjs/common";
import { type Observable } from "rxjs";

import type { ObservabilityRuntime } from "./config";
import { emitHttpObservation } from "./http-log";
import type { HttpRequestView, HttpResponseView } from "./http-types";
import { elapsedMs, requestUrl } from "./http-types";
import { JsonLogger } from "./json-logger";
import { MetricsRegistry } from "./metrics";
import { requestIdOf, ipHashOf } from "./request-context";
import { OBSERVABILITY_RUNTIME } from "./tokens";

@Injectable()
export class AccessLogInterceptor implements NestInterceptor {
  constructor(
    private readonly logger: JsonLogger,
    private readonly metrics: MetricsRegistry,
    @Inject(OBSERVABILITY_RUNTIME) private readonly runtime: ObservabilityRuntime,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") return next.handle();
    const http = context.switchToHttp();
    const req = http.getRequest<HttpRequestView>();
    const res = http.getResponse<HttpResponseView>();
    res.locals.obsAccessAttached = true;
    if (typeof res.locals.obsStartedMs !== "number") res.locals.obsStartedMs = Date.now();
    res.once?.("finish", () => {
      if (res.locals.obsLogged === true) return;
      res.locals.obsLogged = true;
      const code = res.locals.obsCode;
      const cause = res.locals.obsCause;
      emitHttpObservation(this.logger, this.metrics, this.runtime, {
        method: req.method ?? "GET",
        url: requestUrl(req),
        status: res.statusCode ?? 200,
        durationMs: elapsedMs(res),
        requestId: requestIdOf(req, res),
        code: typeof code === "string" ? code : undefined,
        cause: typeof cause === "string" ? cause : undefined,
        ipHash: ipHashOf(res),
      });
    });
    return next.handle();
  }
}
