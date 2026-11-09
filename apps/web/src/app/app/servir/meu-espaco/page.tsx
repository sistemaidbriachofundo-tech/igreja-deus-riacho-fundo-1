import type { Metadata } from "next";
import { ServingWorkspace } from "../../../../components/serving/ServingWorkspace";

export const metadata: Metadata = {
  title: "Meu Espaço — escala",
  description: "Confirmação da própria escala e atalho da carteirinha, sem listas de outras pessoas.",
  robots: { index: false, follow: false },
};

export default function MeuEspacoPage() {
  return <ServingWorkspace surface="membro" />;
}
