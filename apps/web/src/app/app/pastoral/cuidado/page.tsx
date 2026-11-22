import { AppShell } from "../../../../components/AppShell";
import { PastoralDesk } from "../../../../components/PastoralDesk";

export default function PastoralCarePage() {
  return <AppShell active="pastoral" pastoralSection="cuidado" meta="Cuidado pastoral"><PastoralDesk care /></AppShell>;
}
