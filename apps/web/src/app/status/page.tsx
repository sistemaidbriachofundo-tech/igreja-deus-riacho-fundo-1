import Link from "next/link";
import { APP_NAME } from "@idbrf/shared";

function CrossMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M10.2 3.2h3.6v6.4h6v3.6h-6v7.6h-3.6v-7.6h-6V9.6h6z"
      />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none">
      <path
        d="M4 11.2 12 4.5l8 6.7V20a1 1 0 0 1-1 1h-5.2v-5.4H10.2V21H5a1 1 0 0 1-1-1z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StatusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none">
      <path
        d="M5 17V7m7 10V4m7 13v-7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function StatusPage() {
  return (
    <div className="shell">
      <aside className="sidebar" aria-label="Navegação principal">
        <div className="sidebar-brand">
          <div className="brand-mark" aria-hidden="true">
            <CrossMark />
          </div>
          <div className="brand-copy">
            <p className="brand-name">{APP_NAME}</p>
            <p className="brand-tag">Fé · Família · Cuidado</p>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Seções">
          <Link className="nav-item" href="/">
            <HomeIcon />
            Início
          </Link>
          <Link
            className="nav-item is-active"
            href="/status/"
            aria-current="page"
          >
            <StatusIcon />
            Status
          </Link>
        </nav>

        <p className="sidebar-foot">Preview estático · GitHub Pages</p>
      </aside>

      <div className="shell-main">
        <header className="topbar">
          <p className="topbar-title">Status do projeto</p>
          <p className="topbar-meta">Engenharia · F1-SEC</p>
        </header>

        <main className="content">
          <header className="page-hero">
            <p className="eyebrow">Infraestrutura</p>
            <h1>Status do bootstrap</h1>
            <p className="lede">
              Progresso de engenharia do monorepo NestJS + Next.js + Prisma.
              Sem dados reais nesta página.
            </p>
          </header>

          <section className="status-panel" aria-label="Status do bootstrap">
            <h2>Checklist</h2>
            <ul className="status-list">
              <li>CI: lint → typecheck → test → build</li>
              <li>SonarCloud: job pronto (requer SONAR_TOKEN)</li>
              <li>Pages: site estático (sem API/DB)</li>
              <li>DB local/CI: Postgres via Docker Compose (opção A)</li>
            </ul>
          </section>

          <footer className="page-foot">
            <p>
              API local: <code>GET /health</code> em{" "}
              <code>http://localhost:3001</code>
            </p>
            <p>
              Produção HML/PRD: Hostinger VPS (depois de CI/Sonar/Pages).
            </p>
            <p>
              <Link href="/">← Voltar à página principal</Link>
            </p>
          </footer>
        </main>
      </div>
    </div>
  );
}
