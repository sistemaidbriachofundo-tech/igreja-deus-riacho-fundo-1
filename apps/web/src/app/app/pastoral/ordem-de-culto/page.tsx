import { AppShell } from "../../../../components/AppShell";
import { ServiceOrderDesk } from "../../../../components/pastoral/ServiceOrderDesk";

export default function ServiceOrderPage() {
  return <AppShell active="pastoral" pastoralSection="ordem-de-culto" meta="Ordem de Culto"><ServiceOrderDesk /></AppShell>;
}
