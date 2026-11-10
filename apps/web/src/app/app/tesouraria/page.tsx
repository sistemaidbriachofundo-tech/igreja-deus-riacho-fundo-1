import type { Metadata } from "next";
import { AppShell } from "../../../components/AppShell";
import { TreasuryPanel } from "../../../components/TreasuryPanel";

export const metadata: Metadata = {
  title: "Tesouraria",
  description: "Posição, extrato e conciliação do ledger de homologação.",
  robots: { index: false, follow: false },
};

export default function TesourariaPage() {
  return (
    <AppShell active="tesouraria" meta="Tesouraria">
      <TreasuryPanel />
    </AppShell>
  );
}
