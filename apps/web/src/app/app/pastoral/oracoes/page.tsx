import { AppShell } from "../../../../components/AppShell";
import { PastoralPrayerQueue } from "../../../../components/PastoralCommunity";

export default function PrayersPage() {
  return <AppShell active="pastoral" meta="Pedidos de oração" pastoralSection="oracoes"><PastoralPrayerQueue /></AppShell>;
}
