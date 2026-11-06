import { HmlPhaseOne } from "../../components/HmlPhaseOne";
import type { Metadata } from "next";
import { ChurchDashboard } from "../../components/ChurchDashboard";

export default function VisaoGeralPage() {
  return process.env.NEXT_PUBLIC_HML_ENABLED === "true"
    ? <HmlPhaseOne view="overview" />
    : <ChurchDashboard />;
}

export const metadata: Metadata = {
  title: "Área Administrativa",
  description: "Painel de gestão de pessoas, ministérios, conteúdo e processos — Igreja de Deus Riacho Fundo I.",
};
