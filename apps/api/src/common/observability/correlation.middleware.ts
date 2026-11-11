import { Injectable, NestMiddleware } from "@nestjs/common";

import { requestContext } from "./context";
import type { HttpRequestView, HttpResponseView } from "./http-types";
import { resolveRequestId } from "./request-id";

@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  use(req: HttpRequestView, res: HttpResponseView, next: () => void): void {
    const header = req.headers?.["x-request-id"] ?? req.headers?.["x-correlation-id"];
    const resolved = resolveRequestId(header);
    const startedAtMs = Date.now();
    res.setHeader("X-Request-Id", resolved.id);
    res.locals.obsRequestId = resolved.id;
    res.locals.obsStartedMs = startedAtMs;
    requestContext.run({ requestId: resolved.id, startedAtMs }, () => next());
  }
}
