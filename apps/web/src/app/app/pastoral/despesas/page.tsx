import { AppShell } from "../../../../components/AppShell";
import { ExpenseApprovals } from "../../../../components/ExpenseApprovals";

export default function PastoralExpensesPage() {
  return <AppShell active="pastoral" pastoralSection="despesas" meta="Despesas pastorais"><ExpenseApprovals pastoral /></AppShell>;
}
