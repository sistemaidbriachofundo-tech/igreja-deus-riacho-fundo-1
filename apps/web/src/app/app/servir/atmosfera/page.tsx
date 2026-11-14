import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "../../../../components/AppShell";
import { MinistryDeskPage } from "../../../../components/MinistryDeskPage";

export const metadata: Metadata = {
  title: "Atmosfera — escalas",
  description: "Escalas de Atmosfera por função e horário.",
  robots: { index: false, follow: false },
};

export default function AtmosferaPage() {
  return <AppShell active="atmosfera" meta="Escalas · Atmosfera"><Suspense fallback={null}><MinistryDeskPage ministrySlug="atmosfera" /></Suspense></AppShell>;
}
