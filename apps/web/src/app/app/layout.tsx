import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: {
    default: "ID Riacho 1 — Área Administrativa",
    template: "%s · ID Riacho 1",
  },
  description: "Área administrativa da Igreja de Deus — Riacho Fundo I.",
};

export default function InternalLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
