import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestContextState {
  requestId: string;
}

export const requestContext = new AsyncLocalStorage<RequestContextState>();

export function getRequestId(): string | undefined {
  return requestContext.getStore()?.requestId;
}
