import { APP_NAME } from "@idbrf/shared";

export default function HomePage() {
  return (
    <main className="page">
      <header className="hero">
        <p className="eyebrow">Preview estático · GitHub Pages</p>
        <h1>{APP_NAME}</h1>
        <p className="lede">
          Skeleton F1-SEC: monorepo NestJS + Next.js + Prisma. Sem dados reais —
          apenas progresso de engenharia.
        </p>
      </header>

      <section className="status" aria-label="Status do bootstrap">
        <h2>Status</h2>
        <ul>
          <li>CI: lint → typecheck → test → build</li>
          <li>SonarCloud: job pronto (requer SONAR_TOKEN)</li>
          <li>Pages: este site (estático, sem API/DB)</li>
          <li>DB local/CI: Postgres via Docker Compose (opção A)</li>
        </ul>
      </section>

      <footer className="footer">
        <p>
          API local: <code>GET /health</code> em{" "}
          <code>http://localhost:3001</code>
        </p>
        <p className="muted">
          Produção HML/PRD: Hostinger VPS (depois de CI/Sonar/Pages).
        </p>
      </footer>
    </main>
  );
}
