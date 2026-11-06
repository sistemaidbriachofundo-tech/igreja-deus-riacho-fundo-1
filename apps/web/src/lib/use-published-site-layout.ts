"use client";

import { useEffect, useState } from "react";
import { defaultSiteLayout, parsePublicSiteLayout, type SiteLayout } from "./site-layout";
import { publicApiBase } from "./portal-live-data";

/** Live settings are opt-in. Pages stays unchanged until content is approved. */
export function usePublishedSiteLayout(): SiteLayout {
  const [layout, setLayout] = useState<SiteLayout>(defaultSiteLayout);
  const enabled = process.env.NEXT_PUBLIC_SITE_LAYOUT_LIVE_ENABLED === "true";
  useEffect(() => {
    if (!enabled) return;
    const base = publicApiBase(process.env.NEXT_PUBLIC_API_URL);
    if (!base || (base.includes("localhost") && process.env.NODE_ENV !== "development")) return;
    const ctrl = new AbortController();
    void fetch(base + "/public/site-layout", {
      signal:ctrl.signal,mode:"cors",credentials:"omit",cache:"no-store",
      headers:{Accept:"application/json"},
    }).then(async r => {
      if (!r.ok) throw new Error("Configuração pública indisponível");
      return parsePublicSiteLayout(await r.json());
    }).then(data => {
      if (!ctrl.signal.aborted && data?.layout) setLayout(data.layout);
    }).catch(() => { /* Site institucional mantém a composição aprovada. */ });
    return () => ctrl.abort();
  }, [enabled]);
  return layout;
}
