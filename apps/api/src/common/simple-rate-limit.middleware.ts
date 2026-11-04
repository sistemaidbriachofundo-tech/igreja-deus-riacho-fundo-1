import {
  Injectable,
  NestMiddleware,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

type Bucket = { count: number; resetAt: number };

/**
 * Rate limit in-memory (DEV/HML single-node). Não substitui WAF/API gateway em PRD.
 * Aplicado em login e verificação pública de carteirinha.
 */
@Injectable()
export class SimpleRateLimitMiddleware implements NestMiddleware {
  private readonly buckets = new Map<string, Bucket>();
  private readonly limit = Number(process.env.RATE_LIMIT_MAX ?? 30);
  private readonly windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000);

  use(req: Request, _res: Response, next: NextFunction): void {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const key = `${req.method}:${req.path}:${ip}`;
    const now = Date.now();
    const current = this.buckets.get(key);
    if (!current || current.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      next();
      return;
    }
    current.count += 1;
    if (current.count > this.limit) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: "Muitas tentativas — aguarde e tente de novo",
          code: "RATE_LIMITED",
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    next();
  }
}
