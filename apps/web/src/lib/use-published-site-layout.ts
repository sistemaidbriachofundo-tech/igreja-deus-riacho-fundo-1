"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { defaultSiteLayout, parsePublicSiteLayout, type SiteLayout } from "./site-layout";
import { publicApiBase } from "./portal-live-data";

/**
 * Todos os componentes da Home recebem exatamente a MESMA versão aprovada.
 * Uma busca por montagem, nunca três chamadas concorrentes para Hero/Galeria/Seções.
 * O fallback estático institucional permanece íntegro se a API falhar.
 */
const PublishedLayoutContext = createContext<SiteLayout | null>(null);

function useLoadApprovedLayout(active: boolean): SiteLayout {
  const [layout, setLayout] = useState<SiteLayout>(defaultSiteLayout);

  useEffect(() => {
    if (!active || process.env.NEXT_PUBLIC_SITE_LAYOUT_LIVE_ENABLED !== "true") return;
    const base = publicApiBase(process.env.NEXT_PUBLIC_API_URL);
    if (!base || (base.includes("localhost") && process.env.NODE_ENV !== "development")) return;

    const controller = new AbortController();
    void fetch(base + "/public/site-layout", {
      signal: controller.signal,
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      headers: { Accept: "application/json" },
    }).then(async response => {
      if (!response.ok) throw new Error("Configuração pública indisponível");
      return parsePublicSiteLayout(await response.json());
    }).then(result => {
      if (!controller.signal.aborted && result?.layout) setLayout(result.layout);
    }).catch(() => { /* Mantém a última versão visual aprovada no código. */ });

    return () => controller.abort();
  }, [active]);

  return layout;
}

export function PublishedSiteLayoutProvider({ children }: { children: ReactNode }) {
  const layout = useLoadApprovedLayout(true);
  return <PublishedLayoutContext.Provider value={layout}>{children}</PublishedLayoutContext.Provider>;
}

export function usePublishedSiteLayout(): SiteLayout {
  const provided = useContext(PublishedLayoutContext);
  const fallback = useLoadApprovedLayout(provided === null);
  return provided ?? fallback;
}
