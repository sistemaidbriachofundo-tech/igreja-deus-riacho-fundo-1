import { HttpException } from "@nestjs/common";

import { redactText } from "./redaction";
import { generateRequestId, isSafeRequestId } from "./request-id";

export interface PublicErrorBody {
  statusCode: number;
  message: string | string[];
  code: string;
  requestId: string;
}

const SAFE_CODE = /^[A-Z][A-Z0-9_]{0,48}$/;

const GENERIC: Record<number, { message: string; code: string }> = {
  400: { message: "Dados inválidos", code: "VALIDATION_ERROR" },
  401: { message: "Não autorizado", code: "UNAUTHORIZED" },
  403: { message: "Acesso negado", code: "FORBIDDEN" },
  404: { message: "Não encontrado", code: "NOT_FOUND" },
  409: { message: "Conflito", code: "CONFLICT" },
  429: { message: "Muitas tentativas — aguarde e tente de novo", code: "RATE_LIMITED" },
};

export function toPublicError(input: {
  status: number;
  message?: string | string[];
  code?: string;
  requestId: string;
}): PublicErrorBody {
  const status = normalizeStatus(input.status);
  const requestId = isSafeRequestId(input.requestId) ? input.requestId : generateRequestId();
  if (status >= 500) {
    return { statusCode: status, message: "Erro interno", code: "INTERNAL_ERROR", requestId };
  }
  const fallback = GENERIC[status] ?? { message: "Não foi possível concluir", code: "HTTP_ERROR" };
  return {
    statusCode: status,
    message: sanitizeMessage(input.message, fallback.message),
    code: input.code && SAFE_CODE.test(input.code) ? input.code : fallback.code,
    requestId,
  };
}

export function safeCause(exception: unknown, logStack: boolean): string | undefined {
  if (!(exception instanceof Error)) return undefined;
  const name = /^[A-Za-z_$][A-Za-z0-9_$]{0,40}$/.test(exception.name) ? exception.name : "Error";
  const message = redactText(exception.message).replace(/[\r\n]+/g, " ").slice(0, 160);
  if (!logStack) return `${name}: ${message}`;
  const stack = redactText(exception.stack ?? "").replace(/[\r\n]+/g, " ").slice(0, 160);
  return `${name}: ${message} ${stack}`.slice(0, 180);
}

export interface ClientPayload {
  status: number;
  body: PublicErrorBody | { status: "ready" | "unavailable" } | LegacyReadinessBody;
}

interface LegacyReadinessBody {
  status: "unavailable" | "ready";
  service?: "api";
  database?: "ok" | "unavailable";
}

/**
 * Corpo para o cliente. 5xx genérico, 4xx só com mensagem que passou na
 * máscara. O 503 de readiness conhecido preserva os três campos operacionais
 * já usados pelos smokes; qualquer campo extra é descartado.
 */
export function toClientPayload(exception: unknown, requestId: string): ClientPayload {
  const readiness = readLegacyReadiness(exception);
  if (readiness) return readiness;
  if (exception instanceof HttpException) {
    const status = normalizeStatus(exception.getStatus());
    const response = exception.getResponse();
    return {
      status,
      body: toPublicError({
        status,
        message: status >= 500 ? undefined : readMessage(response, exception.message),
        code: readCode(response),
        requestId,
      }),
    };
  }
  return { status: 500, body: toPublicError({ status: 500, requestId }) };
}

export function toPublicReadiness(ok: boolean): { status: "ready" | "unavailable" } {
  return { status: ok ? "ready" : "unavailable" };
}

function readLegacyReadiness(exception: unknown): ClientPayload | null {
  if (!(exception instanceof HttpException)) return null;
  const response = exception.getResponse();
  if (!response || typeof response !== "object" || Array.isArray(response)) return null;
  const body = response as Record<string, unknown>;
  if (body.status !== "ready" && body.status !== "unavailable") return null;
  const exact = legacyFields(body);
  if (exact) {
    return { status: exception.getStatus(), body: exact };
  }
  return {
    status: exception.getStatus() >= 400 ? exception.getStatus() : 503,
    body: { status: body.status },
  };
}

function legacyFields(body: Record<string, unknown>): LegacyReadinessBody | null {
  const keys = Object.keys(body);
  if (!keys.every((key) => key === "status" || key === "service" || key === "database")) return null;
  if (body.service !== undefined && body.service !== "api") return null;
  if (body.database !== undefined && body.database !== "ok" && body.database !== "unavailable") return null;
  const out: LegacyReadinessBody = { status: body.status as "ready" | "unavailable" };
  if (body.service === "api") out.service = "api";
  if (body.database === "ok" || body.database === "unavailable") out.database = body.database;
  return out;
}

function readMessage(response: string | object, fallback: string): string | string[] {
  if (typeof response === "string") return response;
  if (!response || typeof response !== "object" || !("message" in response)) return fallback;
  const message = (response as { message?: unknown }).message;
  if (typeof message === "string") return message;
  if (Array.isArray(message) && message.every((item) => typeof item === "string")) {
    return message as string[];
  }
  return fallback;
}

function readCode(response: string | object): string | undefined {
  if (!response || typeof response !== "object" || !("code" in response)) return undefined;
  const code = (response as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function sanitizeMessage(message: string | string[] | undefined, fallback: string): string | string[] {
  if (Array.isArray(message)) {
    const items = message.slice(0, 8).map((item) => cleanMessage(item));
    if (items.length === 0 || items.some((item) => item === null)) return fallback;
    return items as string[];
  }
  if (typeof message !== "string") return fallback;
  return cleanMessage(message) ?? fallback;
}

function cleanMessage(message: string): string | null {
  const trimmed = message.trim();
  if (!trimmed || trimmed.length > 180) return null;
  if (/[\r\n<>]/.test(trimmed)) return null;
  if (redactText(trimmed) !== trimmed) return null;
  if (/\bstack\b|prisma|ECONN|SELECT |INSERT |UPDATE |DELETE /i.test(trimmed)) return null;
  return trimmed;
}

function normalizeStatus(status: number): number {
  if (!Number.isInteger(status) || status < 400 || status > 599) return 500;
  return status;
}
