import type { Metadata } from "next";
import { ActivateAccess } from "../../components/ActivateAccess";

export const metadata: Metadata = {
  title: "Redefinir senha | Igreja de Deus — Riacho Fundo I",
  robots: { index: false, follow: false, noarchive: true },
};

export default function ResetPasswordPage() {
  return <ActivateAccess recovery />;
}
