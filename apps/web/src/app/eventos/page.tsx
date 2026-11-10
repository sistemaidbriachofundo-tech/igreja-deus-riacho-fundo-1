import type { Metadata } from "next";
import { PublicSectionRedirect } from "../../components/PublicSectionRedirect";

export const metadata: Metadata = {
  title: "Agenda da Igreja",
  description: "A agenda publicada faz parte da página inicial da Igreja de Deus no Riacho Fundo I.",
};

export default function EventsPage() {
  return (
    <main id="conteudo">
      <h1>Agenda</h1>
      <p>Os encontros confirmados estão na página inicial da igreja.</p>
      <PublicSectionRedirect sectionId="agenda" label="Ir para a agenda" />
    </main>
  );
}
