import type { Metadata } from "next";
import { AccessDirectory } from "../../../components/AccessDirectory";
import { AppShell } from "../../../components/AppShell";

export const metadata: Metadata = {
  title: "Acessos",
  robots: { index: false, follow: false },
};

export default function AccessPage() {
  return <AppShell active="acessos" meta="Acessos"><AccessDirectory /></AppShell>;
}
