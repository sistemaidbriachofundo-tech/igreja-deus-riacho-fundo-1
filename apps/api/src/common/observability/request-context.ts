import { currentRequestId } from "./context";
import type { HttpRequestView, HttpResponseView } from "./http-types";
import { isSafeRequestId, resolveRequestId } from "./request-id";

export function requestIdOf(req: HttpRequestView, res: HttpResponseView): string {
  const fromLocals = res.locals.obsRequestId;
  if (typeof fromLocals === "string" && isSafeRequestId(fromLocals)) return fromLocals;
  const fromContext = currentRequestId();
  if (fromContext && isSafeRequestId(fromContext)) return fromContext;
  const header = req.headers?.["x-request-id"] ?? req.headers?.["x-correlation-id"];
  const resolved = resolveRequestId(header);
  res.locals.obsRequestId = resolved.id;
  return resolved.id;
}

export function ipHashOf(res: HttpResponseView): string | undefined {
  const value = res.locals.obsIpHash;
  return typeof value === "string" ? value : undefined;
}
