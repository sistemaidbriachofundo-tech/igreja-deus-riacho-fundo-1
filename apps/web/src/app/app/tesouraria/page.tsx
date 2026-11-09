import type { Metadata } from "next";
import { AppShell } from "../../../components/AppShell";
import { TreasuryPanel } from "../../../components/TreasuryPanel";

export const metadata: Metadata = {
  title: "Tesouraria — posição sintética",
  description: "Receitas recebidas, recebíveis, caixa liquidado e despesas comprometidas em dados sintéticos.",
  robots: { index: false, follow: false },
};

export default function TesourariaPage() {
  return (
    <AppShell active="operacao" meta="Tesouraria · HML sintética">
      <TreasuryPanel />
    </AppShell>
  );
}
