import type { Metadata } from "next";
import { DesignSystemShowcase } from "../../components/ui/Showcase";

export const metadata: Metadata = {
  title: "Fundação visual",
  description:
    "Vitrine do design system da Igreja de Deus no Riacho Fundo I. Dados sintéticos, sem cadastros reais.",
  robots: { index: false, follow: false },
};

export default function DesignSystemPage() {
  return <DesignSystemShowcase />;
}
