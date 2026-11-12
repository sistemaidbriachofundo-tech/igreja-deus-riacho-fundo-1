import type { Metadata } from "next";
import { ConnectionDesk } from "../../../components/ConnectionDesk";

export const metadata: Metadata = {
  title: "Conexão e Grupos de Amizade — IDB Riacho",
  robots: { index: false, follow: false },
};

export default function ConnectionPage() {
  return <ConnectionDesk />;
}
