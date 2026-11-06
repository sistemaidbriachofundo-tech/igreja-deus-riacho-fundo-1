"use client";

import { useEffect, useState } from "react";
import { fetchPublished } from "./portal-live-data";

export type PublishedState<T> =
  | { status:"loading"; data:null }
  | { status:"ready"; data:T }
  | { status:"unavailable"; data:null };

/** No published records are manufactured if a public API is unavailable. */
export function usePublishedResource<T>(path:string, parser:(value:unknown)=>T|null): PublishedState<T> {
  const [state, setState] = useState<PublishedState<T>>({ status:"loading", data:null });
  useEffect(() => {
    const controller = new AbortController();
    fetchPublished(path, parser, { signal:controller.signal })
      .then(data => { if (!controller.signal.aborted) setState({ status:"ready",data }); })
      .catch(() => { if (!controller.signal.aborted) setState({ status:"unavailable", data:null }); });
    return () => controller.abort();
  },[path,parser]);
  return state;
}
