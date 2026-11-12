import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "../../../components/AppShell";
import { MinistryDeskPage } from "../../../components/MinistryDeskPage";

export const metadata: Metadata = {
  title: "Ministérios",
  description: "Equipes, integrantes e escalas dos ministérios autorizados para a conta.",
  robots: { index: false, follow: false },
};

export default function MinisteriosFormaisPage() {
  return (
    <AppShell active="ministerios" meta="Ministérios">
      <Suspense fallback={<p role="status">Carregando ministérios…</p>}>
        <MinistryDeskPage />
      </Suspense>
    </AppShell>
  );
}
