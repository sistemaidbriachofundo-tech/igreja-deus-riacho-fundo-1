import { Inject, Injectable, NestMiddleware } from "@nestjs/common";

import { deriveClientIp } from "./client-ip";
import type { ObservabilityRuntime } from "./config";
import { emitHttpObservation } from "./http-log";
import type { HttpRequestView, HttpResponseView } from "./http-types";
import { elapsedMs, requestUrl } from "./http-types";
import { JsonLogger } from "./json-logger";
import { MetricsRegistry } from "./metrics";
import { toPublicError, safeCause } from "./public-error";
import {
  compileRateRules,
  hashIp,
  matchRateRule,
  rateLimitKey,
  RateLimiter,
  type CompiledRateRule,
} from "./rate-limit";
import { requestIdOf } from "./request-context";
import { normalizeRoute } from "./route";
import { OBSERVABILITY_RUNTIME } from "./tokens";

@Injectable()
export class ObservabilityRateLimitMiddleware implements NestMiddleware {
  private readonly rules: CompiledRateRule[];

  constructor(
    private readonly limiter: RateLimiter,
    private readonly logger: JsonLogger,
    private readonly metrics: MetricsRegistry,
    @Inject(OBSERVABILITY_RUNTIME) private readonly runtime: ObservabilityRuntime,
  ) {
    this.rules = compileRateRules(runtime.config.rateLimit.rules);
  }

  async use(req: HttpRequestView, res: HttpResponseView, next: () => void): Promise<void> {
    const method = (req.method ?? "GET").toUpperCase();
    const url = requestUrl(req);
    const rule = matchRateRule(method, url, this.rules);
    if (!rule) {
      next();
      return;
    }
    const ip = deriveClientIp(
      {
        remoteAddress: req.socket?.remoteAddress ?? req.ip,
        forwardedFor: req.headers?.["x-forwarded-for"],
      },
      {
        trustedProxies: this.runtime.config.trustedProxies,
        trustedHops: this.runtime.config.trustedHops,
      },
    );
    res.locals.obsIpHash = hashIp(ip);
    try {
      const decision = await this.limiter.consume(
        rateLimitKey(rule.id, method, url, ip),
        rule.limit,
        rule.windowMs,
      );
      if (decision.allowed) {
        next();
        return;
      }
      const retryAfter = Math.max(1, Math.ceil(decision.retryAfterMs / 1000));
      this.deny(req, res, 429, rule.message, rule.code, retryAfter);
    } catch (error) {
      if (this.runtime.config.rateLimit.failMode === "open") {
        this.logger.write({
          level: "error",
          event: "rate_limit.store_error",
          code: "RATE_LIMIT_STORE_ERROR",
          cause: safeCause(error, false),
          method,
          route: normalizeRoute(url),
          ipHash: hashIp(ip),
          backend: this.runtime.backend,
        });
        next();
        return;
      }
      this.deny(
        req,
        res,
        503,
        "Serviço temporariamente indisponível",
        "RATE_LIMIT_UNAVAILABLE",
        undefined,
        safeCause(error, false),
      );
    }
  }

  private deny(
    req: HttpRequestView,
    res: HttpResponseView,
    status: number,
    message: string,
    code: string,
    retryAfter?: number,
    cause?: string,
  ): void {
    const requestId = requestIdOf(req, res);
    const body = toPublicError({ status, message, code, requestId });
    res.setHeader("X-Request-Id", body.requestId);
    if (retryAfter !== undefined) res.setHeader("Retry-After", String(retryAfter));
    res.locals.obsCode = body.code;
    if (res.locals.obsLogged !== true) {
      res.locals.obsLogged = true;
      emitHttpObservation(this.logger, this.metrics, this.runtime, {
        method: req.method ?? "GET",
        url: requestUrl(req),
        status,
        durationMs: elapsedMs(res),
        requestId: body.requestId,
        code: status >= 500 ? code : body.code,
        cause,
        ipHash: typeof res.locals.obsIpHash === "string" ? res.locals.obsIpHash : undefined,
      });
    }
    res.status(status).json(body);
  }
}
