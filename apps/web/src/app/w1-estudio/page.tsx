import type { Metadata } from "next";
import { W1PortalStudio } from "../../w1-portal/W1PortalStudio";

export const metadata: Metadata = {
  title: "Prévia isolada do portal",
  description: "Estúdio editorial sintético. Não altera o site público oficial.",
  robots: { index: false, follow: false },
};

export default function W1StudioPage() {
  return <W1PortalStudio />;
}
