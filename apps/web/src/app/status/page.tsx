import Link from "next/link";
import { AppShell } from "../../components/AppShell";

export default function StatusPage() {
  return (
    <AppShell meta="Engenharia · F1-SEC / F2">
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
          <li>F1 IAM: person_id + JWT + grants</li>
          <li>F2: memberships + carteirinha (API)</li>
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
    </AppShell>
  );
}
