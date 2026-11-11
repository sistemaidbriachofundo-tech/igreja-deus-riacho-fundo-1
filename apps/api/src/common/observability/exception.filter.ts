import {
  Catch,
  Inject,
  Injectable,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common";

import type { ObservabilityRuntime } from "./config";
import { emitHttpObservation } from "./http-log";
import type { HttpRequestView, HttpResponseView } from "./http-types";
import { elapsedMs, requestUrl } from "./http-types";
import { JsonLogger } from "./json-logger";
import { MetricsRegistry } from "./metrics";
import { safeCause, toClientPayload } from "./public-error";
import { requestIdOf } from "./request-context";
import { OBSERVABILITY_RUNTIME } from "./tokens";

@Catch()
@Injectable()
export class ObservabilityExceptionFilter implements ExceptionFilter {
  constructor(
    private readonly logger: JsonLogger,
    private readonly metrics: MetricsRegistry,
    @Inject(OBSERVABILITY_RUNTIME) private readonly runtime: ObservabilityRuntime,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<HttpRequestView>();
    const res = http.getResponse<HttpResponseView>();
    if (res.headersSent) return;
    const requestId = requestIdOf(req, res);
    const payload = toClientPayload(exception, requestId);
    const cause = safeCause(exception, this.runtime.config.logStack);
    res.locals.obsCode = "code" in payload.body ? payload.body.code : "NOT_READY";
    if (cause) res.locals.obsCause = cause;
    res.setHeader("X-Request-Id", requestId);
    res.status(payload.status).json(payload.body);
    if (res.locals.obsLogged === true || res.locals.obsAccessAttached === true) return;
    res.locals.obsLogged = true;
    emitHttpObservation(this.logger, this.metrics, this.runtime, {
      method: req.method ?? "GET",
      url: requestUrl(req),
      status: payload.status,
      durationMs: elapsedMs(res),
      requestId,
      code: typeof res.locals.obsCode === "string" ? res.locals.obsCode : undefined,
      cause,
    });
  }
}
