import type { Metadata } from "next";
import { GuestRegistration } from "../../components/GuestRegistration";

export const metadata: Metadata = {
  title: "Criar conta como convidado",
  robots: { index: false, follow: false },
};

export default function GuestRegistrationPage() {
  return <GuestRegistration />;
}
