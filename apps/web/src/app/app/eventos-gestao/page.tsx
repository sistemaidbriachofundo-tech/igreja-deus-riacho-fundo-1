import type { Metadata } from "next";
import { EventManagementJourney } from "../../../components/events-management/EventManagementJourney";

export const metadata: Metadata = {
  title: "Gestão de eventos",
  description: "Rascunho, publicação, presença sintética e relatório de participação.",
  robots: { index: false, follow: false },
};

export default function EventosGestaoPage() {
  return <EventManagementJourney />;
}
