import { AppShell } from "../../../components/AppShell";
import { SystemRulesDesk } from "../../../components/SystemRulesDesk";

export default function SystemRulesPage() {
  return <AppShell active="gestao-sistema" meta="Gestão do Sistema"><SystemRulesDesk /></AppShell>;
}
