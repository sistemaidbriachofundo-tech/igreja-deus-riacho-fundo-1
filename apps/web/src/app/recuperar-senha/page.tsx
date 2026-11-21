import type { Metadata } from "next";
import { RequestPasswordReset } from "../../components/RequestPasswordReset";

export const metadata: Metadata = {
  title: "Recuperar senha | Igreja de Deus — Riacho Fundo I",
  robots: { index: false, follow: false, noarchive: true },
};

export default function RequestPasswordResetPage() {
  return <RequestPasswordReset />;
}
