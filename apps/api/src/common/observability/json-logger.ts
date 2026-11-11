import type { LogLevel, ObservabilityConfig } from "./config";
import { redactText } from "./redaction";
import { isSafeRequestId } from "./request-id";

const RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

const SAFE_EVENT = /^[a-z][a-z0-9._-]{0,48}$/;
const SAFE_METHOD = /^[A-Z]{3,7}$/;
const SAFE_CODE = /^[A-Z][A-Z0-9_]{0,48}$/;
const SAFE_HASH = /^[a-f0-9]{12}$/;

export interface LogStream {
  write(chunk: string): void;
}

export interface LogEvent {
  level: Exclude<LogLevel, "silent">;
  event: string;
  requestId?: string;
  method?: string;
  route?: string;
  status?: number;
  durationMs?: number;
  code?: string;
  cause?: string;
  ipHash?: string;
  backend?: "memory" | "redis";
}

/**
 * Uma linha JSON no stdout (ou no stream injetado). Só entram campos da
 * allowlist. Corpo, header e query não têm lugar neste registro.
 */
export class JsonLogger {
  constructor(
    private readonly config: Pick<ObservabilityConfig, "logLevel" | "stage" | "version">,
    private readonly stream: LogStream = process.stdout,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  enabled(level: LogLevel): boolean {
    return RANK[level] >= RANK[this.config.logLevel];
  }

  write(event: LogEvent): void {
    if (!this.enabled(event.level)) return;
    const record: Record<string, string | number> = {
      ts: this.clock().toISOString(),
      level: event.level,
      event: SAFE_EVENT.test(event.event) ? event.event : "app.event",
      version: this.config.version,
      stage: this.config.stage,
    };
    if (event.requestId && isSafeRequestId(event.requestId)) record.requestId = event.requestId;
    if (event.method && SAFE_METHOD.test(event.method)) record.method = event.method;
    if (event.route && event.route.startsWith("/") && !event.route.includes("?")) {
      record.route = event.route.slice(0, 180);
    }
    if (Number.isInteger(event.status) && (event.status as number) >= 100 && (event.status as number) <= 599) {
      record.status = event.status as number;
    }
    if (typeof event.durationMs === "number" && Number.isFinite(event.durationMs) && event.durationMs >= 0 && event.durationMs <= 600_000) {
      record.durationMs = Math.round(event.durationMs);
    }
    if (event.code && SAFE_CODE.test(event.code)) record.code = event.code;
    if (event.cause) record.cause = redactText(event.cause).replace(/[\r\n]+/g, " ").slice(0, 160);
    if (event.ipHash && SAFE_HASH.test(event.ipHash)) record.ipHash = event.ipHash;
    if (event.backend === "memory" || event.backend === "redis") record.backend = event.backend;
    let line = JSON.stringify(record);
    if (line.length > 2000) {
      delete record.cause;
      line = JSON.stringify(record);
    }
    this.stream.write(`${line}\n`);
  }
}
