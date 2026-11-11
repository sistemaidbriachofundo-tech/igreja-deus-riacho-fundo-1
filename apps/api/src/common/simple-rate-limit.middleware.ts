import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NestMiddleware,
  Optional,
} from "@nestjs/common";
import type { RateLimitStore } from "@idbrf/shared";
import type { NextFunction, Request, Response } from "express";
import { PrismaRateLimitStore } from "../platform-security/prisma-rate-limit.repository";

type Bucket = { count: number; resetAt: number };

/**
 * Identidade do cliente já resolvida pelo Express.
 * Não lê X-Forwarded-For: o primeiro salto pode ser forjado quando o proxy não é confiável.
 */
export function clientAddress(req: Pick<Request, "ip" | "socket">): string {
  const ip = req.ip?.trim();
  if (ip) return ip;
  const socket = req.socket?.remoteAddress?.trim();
  if (socket) return socket;
  return "unknown";
}

function isViviPublicChat(req: Request): boolean {
  const path = (req.path || req.url || "").split("?")[0] ?? "";
  return (
    req.method === "POST" &&
    (path === "/public/vivi/chat" || path.endsWith("/public/vivi/chat"))
  );
}

/**
 * Limite em memória por instância e, com RATE_LIMIT_STORE=shared, também no Postgres.
 * Falha do store compartilhado fecha o pedido (429) em vez de liberar a rota.
 * O modo em memória continua o padrão de DEV/HML single-node.
 */
@Injectable()
export class SimpleRateLimitMiddleware implements NestMiddleware {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    @Optional() @Inject(PrismaRateLimitStore) private readonly shared?: RateLimitStore,
  ) {}

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

  private enforceLocal(req: Request): void {
    const { limit, windowMs } = this.configFor(req);
    const key = `${req.method}:${req.path}:${clientAddress(req)}`;
    const now = Date.now();
    const current = this.buckets.get(key);
    if (!current || current.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      return;
    }
    current.count += 1;
    if (current.count > limit) this.reject(req, "RATE_LIMITED");
  }

  private reject(req: Request, code: "RATE_LIMITED" | "RATE_LIMIT_UNAVAILABLE"): never {
    const vivi = isViviPublicChat(req);
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: vivi
          ? "Limite de mensagens do Riachinho atingido — aguarde um minuto"
          : "Muitas tentativas — aguarde e tente de novo",
        code: vivi && code === "RATE_LIMITED" ? "VIVI_RATE_LIMITED" : code,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private async enforceShared(req: Request): Promise<void> {
    const shared = this.shared;
    if (!shared) this.reject(req, "RATE_LIMIT_UNAVAILABLE");
    try {
      const { limit, windowMs } = this.configFor(req);
      const decision = await shared.hit({
        key: `${req.method}:${req.path}:${clientAddress(req)}`,
        limit,
        windowMs,
        now: Date.now(),
      });
      if (!decision.allowed) this.reject(req, "RATE_LIMITED");
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.reject(req, "RATE_LIMIT_UNAVAILABLE");
    }
  }

  use(req: Request, _res: Response, next: NextFunction): void {
    this.enforceLocal(req);
    if (process.env.RATE_LIMIT_STORE !== "shared") {
      next();
      return;
    }
    void this.enforceShared(req).then(
      () => next(),
      (error: unknown) => next(error as Error),
    );
  }
}
