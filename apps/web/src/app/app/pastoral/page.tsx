import type { Metadata } from "next";
import { AppShell } from "../../../components/AppShell";
import { PastoralDesk } from "../../../components/PastoralDesk";

export const metadata: Metadata = {
  title: "Pastoral",
  robots: { index: false, follow: false },
};

export default function PastoralPage() {
  return <AppShell active="pastoral" meta="Pastoral"><PastoralDesk /></AppShell>;
}
