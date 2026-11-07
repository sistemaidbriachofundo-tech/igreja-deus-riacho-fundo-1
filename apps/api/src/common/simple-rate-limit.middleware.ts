import {
  Injectable,
  NestMiddleware,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

type Bucket = { count: number; resetAt: number };

function clientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0]!.trim();
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return forwarded[0].split(",")[0]!.trim();
  }
  return req.ip || req.socket.remoteAddress || "unknown";
}

function isViviPublicChat(req: Request): boolean {
  const path = (req.path || req.url || "").split("?")[0] ?? "";
  return (
    req.method === "POST" &&
    (path === "/public/vivi/chat" || path.endsWith("/public/vivi/chat"))
  );
}

/**
 * Rate limit in-memory (DEV/HML single-node). Não substitui WAF/API gateway em PRD.
 * Aplicado em login, verificação pública de carteirinha e chat público do Riachinho.
 * Em serverless multi-instância o limite é best-effort (store por isolate).
 */
@Injectable()
export class SimpleRateLimitMiddleware implements NestMiddleware {
  private readonly buckets = new Map<string, Bucket>();

  private configFor(req: Request): { limit: number; windowMs: number } {
    if (isViviPublicChat(req)) {
      return {
        limit: Number(process.env.VIVI_PUBLIC_RATE_MAX ?? 8),
        windowMs: Number(process.env.VIVI_PUBLIC_RATE_WINDOW_MS ?? 60_000),
      };
    }
    return {
      limit: Number(process.env.RATE_LIMIT_MAX ?? 30),
      windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000),
    };
  }

  use(req: Request, _res: Response, next: NextFunction): void {
    const { limit, windowMs } = this.configFor(req);
    const ip = clientIp(req);
    const key = `${req.method}:${req.path}:${ip}`;
    const now = Date.now();
    const current = this.buckets.get(key);
    if (!current || current.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    current.count += 1;
    if (current.count > limit) {
      const vivi = isViviPublicChat(req);
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: vivi
            ? "Limite de mensagens do Riachinho atingido — aguarde um minuto"
            : "Muitas tentativas — aguarde e tente de novo",
          code: vivi ? "VIVI_RATE_LIMITED" : "RATE_LIMITED",
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    next();
  }
}
