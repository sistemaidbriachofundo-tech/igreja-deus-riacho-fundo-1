import type { Metadata } from "next";
import { ManagementReports } from "../../../components/reports/ManagementReports";

export const metadata: Metadata = {
  title: "Relatórios de gestão",
  description: "Contagens de membresia e ministérios no escopo autorizado.",
  robots: { index: false, follow: false },
};

export default function RelatoriosPage() {
  return <ManagementReports />;
}
