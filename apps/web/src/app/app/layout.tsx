import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: {
    default: "ID Riacho 1 — Área Administrativa",
    template: "%s · ID Riacho 1",
  },
  description: "Área administrativa da Igreja de Deus — Riacho Fundo I.",
  // O painel HML é acessível no domínio do GitHub Pages, mas não deve ser indexado.
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

export default function InternalLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
