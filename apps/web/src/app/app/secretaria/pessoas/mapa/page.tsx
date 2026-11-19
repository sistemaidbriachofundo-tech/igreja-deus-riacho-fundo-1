import type { Metadata } from "next";
import { MembershipMap } from "../../../../../components/secretaria/MembershipMap";

export const metadata: Metadata = { title: "Mapa da Membresia" };

export default function MembershipMapPage() {
  return <MembershipMap />;
}
