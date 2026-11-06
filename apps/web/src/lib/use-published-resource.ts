"use client";

import { useEffect, useState } from "react";
import { fetchPublished, publicApiBase } from "./portal-live-data";

export type PublishedState<T> =
  | { status:"loading"; data:null }
  | { status:"ready"; data:T }
  | { status:"unavailable"; data:null };

/** No published records are manufactured if a public API is unavailable. */
export function usePublishedResource<T>(path:string, parser:(value:unknown)=>T|null): PublishedState<T> {
  const active = process.env.NEXT_PUBLIC_PORTAL_LIVE_ENABLED === "true" && Boolean(publicApiBase(process.env.NEXT_PUBLIC_API_URL));
  const [state, setState] = useState<PublishedState<T>>(active ? { status:"loading", data:null } : { status:"unavailable", data:null });
  useEffect(() => {
    if (!active) { setState({ status:"unavailable", data:null }); return; }
    const controller = new AbortController();
    fetchPublished(path, parser, { signal:controller.signal })
      .then(data => { if (!controller.signal.aborted) setState({ status:"ready",data }); })
      .catch(() => { if (!controller.signal.aborted) setState({ status:"unavailable", data:null }); });
    return () => controller.abort();
  },[path,parser,active]);
  return state;
}
