"use client";

import { PILOT_CHURCH_NAME } from "@idbrf/shared";
import { useCallback, useState } from "react";
import { AppShell } from "../../../components/AppShell";
import { DemoLogin } from "../../../components/DemoLogin";
import { apiGet, loadStoredToken } from "../../../lib/api";
import { withBasePath } from "../../../lib/paths";

interface MembershipRow {
  id: string;
  status: string;
  joinedAt: string;
  notes: string | null;
  person: {
    id: string;
    displayName: string;
    email: string | null;
    status: string;
    householdId: string | null;
  };
  activeCredentialId: string | null;
}

interface ListResponse {
  church: { id: string; slug: string; name: string };
  memberships: MembershipRow[];
}

/**
 * Membros e famílias — espelha `#/pessoas` do protótipo v5 (Central de Membresia).
 * Operações de emissão ficam na Secretaria.
 */
export default function MembrosPage() {
  const [token, setToken] = useState<string | null>(null);
  const [rows, setRows] = useState<MembershipRow[]>([]);
  const [churchName, setChurchName] = useState<string>(PILOT_CHURCH_NAME);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async (accessToken: string) => {
    setBusy(true);
    setError(null);
    try {
      const data = await apiGet<ListResponse>("/memberships", accessToken);
      setRows(data.memberships);
      setChurchName(data.church.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao listar");
    } finally {
      setBusy(false);
    }
  }, []);

  async function handleAuth(accessToken: string) {
    setToken(accessToken);
    await refresh(accessToken);
  }

  return (
    <AppShell active="membros" meta="Membros e famílias · piloto RF1">
      <header className="page-hero">
        <p className="eyebrow">Principal · protótipo v5</p>
        <h1>Membros e famílias</h1>
        <p className="lede">
          Cadastro único da pessoa em {churchName}. Sem duplicar pessoa; vínculos
          e carteirinha na Secretaria.
        </p>
      </header>

      {!token ? (
        <section className="panel" aria-label="Login membros">
          <h2>Acesso demo</h2>
          <DemoLogin
            hintEmail="ana.demo@example.test"
            onAuthenticated={handleAuth}
          />
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              const stored = loadStoredToken();
              if (stored) {
                void handleAuth(stored);
              }
            }}
          >
            Tentar sessão já salva
          </button>
        </section>
      ) : (
        <section className="panel" aria-label="Lista de membresias">
          <div className="panel-head">
            <h2>Membresias — {churchName}</h2>
            <div className="row-actions">
              <a
                className="btn btn-primary"
                href={withBasePath("/app/secretaria/")}
              >
                + Novo cadastro
              </a>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => void refresh(token)}
              >
                Atualizar
              </button>
            </div>
          </div>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          {busy && rows.length === 0 ? (
            <p className="muted">Carregando…</p>
          ) : null}
          {!busy && rows.length === 0 ? (
            <p className="muted">
              Nenhuma membresia. Cadastre pela Secretaria (API local).
            </p>
          ) : (
            <ul className="member-list">
              {rows.map((row) => (
                <li key={row.id}>
                  <div>
                    <strong>{row.person.displayName}</strong>
                    <span className="muted">
                      {" "}
                      · {row.status}
                      {row.person.householdId ? " · família vinculada" : ""}
                      {row.activeCredentialId ? " · carteirinha ativa" : ""}
                    </span>
                  </div>
                  <a
                    className="btn btn-ghost"
                    href={withBasePath("/app/secretaria/")}
                  >
                    Secretaria
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <p className="pages-caveat">
        GitHub Pages exporta HTML estático; a lista exige API Nest (
        <code>npm run dev:api</code>).
      </p>
    </AppShell>
  );
}
