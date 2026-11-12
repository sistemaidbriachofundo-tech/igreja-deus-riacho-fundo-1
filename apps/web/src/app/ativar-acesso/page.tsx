import type { Metadata } from "next";
import { ActivateAccess } from "../../components/ActivateAccess";

export const metadata: Metadata = {
  title: "Ativar acesso | Igreja de Deus — Riacho Fundo I",
  description: "Crie sua senha pessoal a partir do convite individual da igreja.",
  robots: { index: false, follow: false, noarchive: true },
};

export default function ActivateAccessPage() { return <ActivateAccess />; }
