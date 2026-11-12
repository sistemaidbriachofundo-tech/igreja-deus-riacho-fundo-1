import type { Metadata } from "next";
import { PublicSectionRedirect } from "../../components/PublicSectionRedirect";

export const metadata: Metadata = {
  title: "Quem somos",
  description: "Quem somos faz parte da página inicial da Igreja de Deus no Riacho Fundo I.",
};

export default function AboutPage() {
  return (
    <main id="conteudo">
      <h1>Quem somos</h1>
      <p>Esta seção está na página inicial da igreja.</p>
      <PublicSectionRedirect sectionId="quem-somos" label="Ir para Quem somos" />
    </main>
  );
}
