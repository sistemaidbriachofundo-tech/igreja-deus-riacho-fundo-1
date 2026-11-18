"use client";

import { useEffect, useState } from "react";
import { fetchPublished, publicApiBase } from "./portal-live-data";

export type PublishedState<T> =
  | { status:"loading"; data:null }
  | { status:"ready"; data:T }
  | { status:"unavailable"; data:null };

/** No published records are manufactured if a public API is unavailable. */
export function usePublishedResource<T>(path:string, parser:(value:unknown)=>T|null, enabled = true): PublishedState<T> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  const youtube = path === "/public/youtube-recordings";
  const agendaInHomologation = path === "/public/events" && process.env.NEXT_PUBLIC_HML_ENABLED === "true";
  const active = enabled && Boolean(publicApiBase(apiUrl))
    && (process.env.NEXT_PUBLIC_PORTAL_LIVE_ENABLED === "true" || youtube || agendaInHomologation);
  const [state, setState] = useState<PublishedState<T>>(active ? { status:"loading", data:null } : { status:"unavailable", data:null });
  useEffect(() => {
    if (!active) { setState({ status:"unavailable", data:null }); return; }
    const controller = new AbortController();
    const reload = () => {
      void fetchPublished(path, parser, { signal:controller.signal, apiUrl })
        .then(data => { if (!controller.signal.aborted) setState({ status:"ready",data }); })
        .catch(() => { if (!controller.signal.aborted) setState(current => current.status === "ready" ? current : { status:"unavailable", data:null }); });
    };
    reload();
    const timer = youtube ? window.setInterval(reload, 5 * 60_000) : undefined;
    return () => { controller.abort(); window.clearInterval(timer); };
  },[path,parser,active,apiUrl,youtube]);
  return state;
}
