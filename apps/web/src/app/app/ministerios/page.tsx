import type { Metadata } from "next";
import { AppShell } from "../../../components/AppShell";
import { MinistryDeskPage } from "../../../components/MinistryDeskPage";

export const metadata: Metadata = {
  title: "Integrantes do ministério",
  description: "Catálogo formal de integrantes, separado do interesse de voluntariado.",
  robots: { index: false, follow: false },
};

export default function MinisteriosFormaisPage() {
  return <AppShell active="ministerios" meta="Vínculo de ministério · a API confirma se a gravação está disponível"><MinistryDeskPage /></AppShell>;
}
