import type { Metadata } from "next";
import { AppShell } from "../../../components/AppShell";
import { MyAccountPage } from "../../../components/account/MyAccountPage";

export const metadata: Metadata = { title: "Minha conta" };

export default function AccountPage() {
  return <AppShell meta="Minha conta"><MyAccountPage /></AppShell>;
}
