import type { Metadata } from "next";
import { AppShell } from "../../../../components/AppShell";
import { ServingWorkspace } from "../../../../components/serving/ServingWorkspace";

export const metadata: Metadata = {
  title: "Atmosfera — escalas",
  description: "Escalas de Atmosfera por função e horário.",
  robots: { index: false, follow: false },
};

export default function AtmosferaPage() {
  return <AppShell active="escalas" meta="Escalas · Atmosfera"><ServingWorkspace surface="atmosfera" /></AppShell>;
}
