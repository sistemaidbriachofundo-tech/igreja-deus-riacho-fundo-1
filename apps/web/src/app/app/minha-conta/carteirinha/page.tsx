import type { Metadata } from "next";
import { AppShell } from "../../../../components/AppShell";
import { MyOwnCredentialPage } from "../../../../components/account/MyOwnCredentialPage";

export const metadata: Metadata = {
  title: "Minha carteirinha",
  robots: { index: false, follow: false },
};

export default function OwnCredentialPage() {
  return <AppShell meta="Minha carteirinha"><MyOwnCredentialPage /></AppShell>;
}
