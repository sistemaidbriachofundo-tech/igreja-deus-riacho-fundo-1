import type { Metadata } from "next";
import { MembershipInsights } from "../../../../components/MembershipInsights";

export const metadata: Metadata = {
  title: "Membresia e indicadores | Secretaria — Riacho 1",
  description: "Aniversários, perfil e movimentação da membresia, em área restrita.",
  robots: { index: false, follow: false },
};

export default function SecretariaIndicadoresPage() {
  return <MembershipInsights />;
}
