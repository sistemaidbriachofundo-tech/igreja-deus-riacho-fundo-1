import type { Metadata } from "next";
import { AppShell } from "../../../../components/AppShell";
import { ServingWorkspace } from "../../../../components/serving/ServingWorkspace";

export const metadata: Metadata = {
  title: "Louvor — escalas",
  description: "Escalas de Louvor por função e horário, somente com dados de homologação.",
  robots: { index: false, follow: false },
};

export default function LouvorPage() {
  return <AppShell active="escalas" meta="Escalas · Louvor"><ServingWorkspace surface="louvor" /></AppShell>;
}
