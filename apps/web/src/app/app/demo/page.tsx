import type { Metadata } from "next";
import { withBasePath } from "../../../lib/paths";

export const metadata: Metadata = {
  title: "Página retirada",
  robots: { index: false, follow: false },
};

export default function RetiredLocalPage() {
  return (
    <main className="section">
      <h1>Esta página não guarda cadastros</h1>
      <p>
        O arquivo local deste endereço foi retirado. Pessoas, famílias e carteirinhas
        ficam na área autenticada, ligadas ao mesmo cadastro.
      </p>
      <p>
        <a className="btn btn-primary" href={withBasePath("/app/")}>Ir para a visão geral</a>
      </p>
    </main>
  );
}
