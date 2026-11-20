import { AppShell } from "../../../../components/AppShell";
import { CongregationDirectory } from "../../../../components/PastoralCommunity";

export default function CongregationPage() {
  return <AppShell active="pastoral" meta="Congregação" pastoralSection="congregacao"><CongregationDirectory /></AppShell>;
}
