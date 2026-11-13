import { isAdminEnabled } from "../../lib/admin-environment";
import type { Metadata } from "next";
import { ChurchDashboard } from "../../components/ChurchDashboard";
import { PersonaHome } from "../../components/PersonaHome";

export default function VisaoGeralPage() {
  return isAdminEnabled()
    ? <PersonaHome />
    : <ChurchDashboard />;
}

export const metadata: Metadata = {
  title: "Área Administrativa",
  description: "Painel de gestão de pessoas, ministérios, conteúdo e processos — Igreja de Deus Riacho Fundo I.",
};
