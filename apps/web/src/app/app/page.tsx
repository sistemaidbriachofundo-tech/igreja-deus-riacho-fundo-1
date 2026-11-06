import type { Metadata } from "next";
import { ChurchDashboard } from "../../components/ChurchDashboard";

export default function VisaoGeralPage() {
  return <ChurchDashboard />;
}

export const metadata: Metadata = {
  title: "Área Administrativa",
  description: "Painel de gestão de pessoas, ministérios, conteúdo e processos — Igreja de Deus Riacho Fundo I.",
};
