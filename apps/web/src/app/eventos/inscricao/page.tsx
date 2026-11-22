import type { Metadata } from "next";
import { Suspense } from "react";
import { PublicEventRegistration } from "../../../components/events-management/PublicEventRegistration";
import registrationStyles from "../../../components/events-management/public-event-registration.module.css";
import { PublicPage } from "../../../components/PublicPortal";
import { Loading } from "../../../components/ui";

export const metadata: Metadata = {
  title: "Inscrição em evento",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function RegistrationPage() {
  return <Suspense fallback={<PublicPage lightHeader section="agenda">
    <main className={registrationStyles.page} id="conteudo" tabIndex={-1}>
      <h1>Inscrição em evento</h1>
      <Loading label="Carregando evento" />
    </main>
  </PublicPage>}><PublicEventRegistration /></Suspense>;
}
