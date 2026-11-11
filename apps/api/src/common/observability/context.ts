import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestContext {
  requestId: string;
  startedAtMs: number;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function currentRequestId(): string | undefined {
  return requestContext.getStore()?.requestId;
}
