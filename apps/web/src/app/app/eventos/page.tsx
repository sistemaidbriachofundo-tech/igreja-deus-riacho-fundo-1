import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "../../../components/AppShell";
import { MemberEvents } from "../../../components/events-management/MemberEvents";

export const metadata: Metadata = { title: "Eventos" };

export default function MemberEventsPage() {
  return <AppShell active="eventos-membro" meta="Eventos"><Suspense fallback={null}><MemberEvents /></Suspense></AppShell>;
}
