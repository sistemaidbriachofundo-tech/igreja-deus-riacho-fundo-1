import type { Metadata } from "next";
import { CredentialCheck } from "../../components/credentials/CredentialCheck";

export const metadata: Metadata = {
  title: "Validar carteirinha",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function VerifyCredentialPage() {
  return <CredentialCheck />;
}
