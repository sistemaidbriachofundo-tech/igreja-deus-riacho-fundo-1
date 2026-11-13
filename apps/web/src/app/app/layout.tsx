import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AdminAccessGate } from "../../components/AdminAccessGate";

export const metadata: Metadata = {
  title: {
    default: "ID Riacho 1 — Área Administrativa",
    template: "%s · ID Riacho 1",
  },
  description: "Área administrativa da Igreja de Deus — Riacho Fundo I.",
  // As páginas administrativas não devem ser indexadas.
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

export default function InternalLayout({ children }: { children: ReactNode }) {
  return <AdminAccessGate>{children}</AdminAccessGate>;
}
