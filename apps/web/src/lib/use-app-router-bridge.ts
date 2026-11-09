"use client";

import { useEffect, useState, type ComponentType } from "react";

type BridgeComponent = ComponentType<{ prefetch?: readonly string[] }>;

/** Carrega o roteador só no cliente, para a marcação inicial não depender dele. */
export function useAppRouterBridge(): BridgeComponent | null {
  const [Bridge, setBridge] = useState<BridgeComponent | null>(null);
  useEffect(() => {
    let cancelled = false;
    void import("./app-router-bridge").then(mod => {
      if (!cancelled) setBridge(() => mod.AppRouterBridge);
    });
    return () => { cancelled = true; };
  }, []);
  return Bridge;
}
