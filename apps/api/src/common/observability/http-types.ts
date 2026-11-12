export interface HttpRequestView {
  method?: string;
  url?: string;
  originalUrl?: string;
  path?: string;
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string | null };
}

export interface HttpResponseView {
  statusCode?: number;
  locals: Record<string, unknown>;
  headersSent?: boolean;
  setHeader(name: string, value: string): void;
  status(code: number): { json(body: unknown): void };
  once?(event: string, listener: () => void): void;
}

export function requestUrl(req: HttpRequestView): string {
  return req.originalUrl || req.url || req.path || "/";
}

export function elapsedMs(res: HttpResponseView, now = Date.now()): number {
  const started = res.locals.obsStartedMs;
  if (typeof started !== "number") return 0;
  return Math.max(0, now - started);
}
