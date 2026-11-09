"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { registerAppRouter } from "./app-navigation";

/**
 * Liga o roteador do Next só depois da hidratação.
 * Os testes de marcação estática não montam este módulo.
 */
const NO_PREFETCH: readonly string[] = [];

export function AppRouterBridge({ prefetch = NO_PREFETCH }: { prefetch?: readonly string[] }) {
  const router = useRouter();
  useEffect(() => {
    registerAppRouter({
      push: href => router.push(href),
      replace: href => router.replace(href),
    });
    for (const href of prefetch) {
      if (href.includes("#")) continue;
      void router.prefetch(href);
    }
    return () => registerAppRouter(null);
  }, [prefetch, router]);
  return null;
}
