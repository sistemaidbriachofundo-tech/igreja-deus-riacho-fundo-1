import type { Metadata } from "next";
import { ManagementReports } from "../../../components/reports/ManagementReports";

export const metadata: Metadata = {
  title: "Relatórios",
  description: "Pessoas, ministérios, eventos e custo no escopo autorizado.",
  robots: { index: false, follow: false },
};

export default function RelatoriosPage() {
  return <ManagementReports />;
}
