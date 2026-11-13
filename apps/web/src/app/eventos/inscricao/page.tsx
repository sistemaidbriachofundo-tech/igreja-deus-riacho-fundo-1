import type { Metadata } from "next";
import { PublicEventRegistration } from "../../../components/events-management/PublicEventRegistration";

export const metadata: Metadata = {
  title: "Inscrição em evento",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function RegistrationPage() {
  return <PublicEventRegistration />;
}
