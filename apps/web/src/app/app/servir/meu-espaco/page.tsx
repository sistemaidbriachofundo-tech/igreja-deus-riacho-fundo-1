import type { Metadata } from "next";
import { AppShell } from "../../../../components/AppShell";
import { ServingWorkspace } from "../../../../components/serving/ServingWorkspace";

export const metadata: Metadata = {
  title: "Meu Espaço — escala",
  description: "Confirmação da própria escala e atalho da carteirinha, sem listas de outras pessoas.",
  robots: { index: false, follow: false },
};

export default function MeuEspacoPage() {
  return <AppShell active="meu-espaco" meta="Meu Espaço · sem lista de escalas"><ServingWorkspace surface="membro" /></AppShell>;
}
