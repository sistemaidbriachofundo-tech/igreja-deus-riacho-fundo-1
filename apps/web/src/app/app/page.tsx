import Link from "next/link";
import { AppShell } from "../../components/AppShell";
import { withBasePath } from "../../lib/paths";

/**
 * Visão geral — espelha `#/dashboard` do protótipo v5 (menu Principal),
 * restrito ao escopo F2 (sem finanças, escalas, IA, etc.).
 */
export default function VisaoGeralPage() {
  return (
    <AppShell active="visao" meta="Visão geral · piloto RF1">
      <header className="page-hero">
        <p className="eyebrow">Principal · protótipo v5</p>
        <h1>Visão geral</h1>
        <p className="lede">
          Bem-vindo ao sistema da Igreja de Deus no Riacho Fundo I. Recorte F2:
          pessoas, secretaria e carteirinha — dados fictícios.
        </p>
      </header>

      <section className="tint-banner" aria-label="Demonstração navegável">
        <div>
          <h2>Explore a plataforma sem instalar nada</h2>
          <p>Teste cadastro de visitantes, aprovação de membresia e carteirinhas com dados fictícios. A demonstração funciona aqui no GitHub Pages, sem login.</p>
        </div>
        <a className="btn btn-primary" href={withBasePath("/app/demo/")}>Abrir demonstração</a>
      </section>

      <section className="tint-banner" aria-label="Boas-vindas">
        <div>
          <h2>Central de membresia</h2>
          <p>
            Jornada visitante → membro → carteirinha, com autorização no
            servidor. Use os atalhos abaixo — mesma nomenclatura do protótipo.
          </p>
        </div>
        <a className="btn btn-primary" href={withBasePath("/app/membros/")}>
          Abrir membros
        </a>
      </section>

      <section className="overview-grid" aria-label="Atalhos F2">
        <a className="overview-tile" href={withBasePath("/app/membros/")}>
          <h3>Membros e famílias</h3>
          <p>Cadastro único e lista de membresias da congregação piloto.</p>
        </a>
        <a className="overview-tile" href={withBasePath("/app/secretaria/")}>
          <h3>Secretaria</h3>
          <p>Registrar membresia, emitir e revogar carteirinha (QR opaco).</p>
        </a>
        <a
          className="overview-tile"
          href={withBasePath("/app/membros/carteirinha/")}
        >
          <h3>Carteirinhas</h3>
          <p>Área do membro — visualização da carteirinha digital.</p>
        </a>
      </section>

      <p className="pages-caveat">
        Telas F3+ do protótipo (escalas, financeiro, eventos, IA) não entram
        neste ciclo.{" "}
        <Link href="/status/">Status de engenharia</Link>
        {" · "}
        <Link href="/">Site público</Link>
      </p>
    </AppShell>
  );
}
