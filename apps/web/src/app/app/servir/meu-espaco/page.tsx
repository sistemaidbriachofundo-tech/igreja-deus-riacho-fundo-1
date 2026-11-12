import type { Metadata } from "next";
import { AppShell } from "../../../../components/AppShell";
import { ServingWorkspace } from "../../../../components/serving/ServingWorkspace";

export const metadata: Metadata = {
  title: "Meu Espaço — escala",
  description: "Agenda da própria pessoa, com confirmação e recusa gravadas na API, sem listas de outras pessoas.",
  robots: { index: false, follow: false },
};

export default function MeuEspacoPage() {
  return <AppShell active="meu-espaco" meta="Minha escala"><ServingWorkspace surface="membro" /></AppShell>;
}
