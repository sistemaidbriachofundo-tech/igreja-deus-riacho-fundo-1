import { APP_NAME } from "@idbrf/shared";
import { AppShell } from "../components/AppShell";
import { withBasePath } from "../lib/paths";

export default function HomePage() {
  return (
    <AppShell active="home" meta="Preview · landing + status">
      <header className="page-hero">
        <p className="eyebrow">Igreja de Deus · Riacho Fundo I</p>
        <h1>{APP_NAME}</h1>
        <p className="lede">
          Landing de progresso do piloto. Cadastro, secretaria e carteirinha
          ficam em <code>/app</code> — separados desta home pública.
        </p>
      </header>

      <section className="cta-row" aria-label="Áreas do sistema">
        <a className="btn btn-primary" href={withBasePath("/app/secretaria/")}>
          Secretaria
        </a>
        <a
          className="btn btn-secondary"
          href={withBasePath("/app/membros/carteirinha/")}
        >
          Minha carteirinha
        </a>
      </section>

      <section className="status-panel" aria-label="Status do bootstrap">
        <h2>Status</h2>
        <ul className="status-list">
          <li>CI: lint → typecheck → test → build</li>
          <li>F1 IAM: person_id + JWT + grants</li>
          <li>F2 slice: memberships + carteirinha QR opaco (API)</li>
          <li>Pages: estático (sem API/DB) — demo auth só com Nest local</li>
        </ul>
      </section>

      <footer className="page-foot">
        <p>
          API local: <code>http://localhost:3001</code> —{" "}
          <code>POST /auth/login</code>, <code>GET /memberships</code>,{" "}
          <code>GET /credentials/me</code>
        </p>
        <p>
          Produção HML/PRD da API: Hostinger VPS (depois de CI/Sonar/Pages).
        </p>
      </footer>
    </AppShell>
  );
}
