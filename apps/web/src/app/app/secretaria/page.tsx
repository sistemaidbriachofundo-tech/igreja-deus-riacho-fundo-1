"use client";

import { PILOT_CHURCH_NAME } from "@idbrf/shared";
import { useCallback, useState } from "react";
import { AppShell } from "../../../components/AppShell";
import { DemoLogin } from "../../../components/DemoLogin";
import { apiGet, apiPost, loadStoredToken } from "../../../lib/api";

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

export default function SecretariaPage() {
  const [token, setToken] = useState<string | null>(null);
  const [rows, setRows] = useState<MembershipRow[]>([]);
  const [churchName, setChurchName] = useState<string>(PILOT_CHURCH_NAME);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");

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

  async function handleRegister(event: React.FormEvent) {
    event.preventDefault();
    if (!token) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiPost("/memberships", token, {
        displayName,
        email: email || undefined,
      });
      setDisplayName("");
      setEmail("");
      await refresh(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao cadastrar");
      setBusy(false);
    }
  }

  async function handleIssue(membershipId: string) {
    if (!token) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiPost(`/credentials/issue/${membershipId}`, token);
      await refresh(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao emitir");
      setBusy(false);
    }
  }

  async function handleRevoke(credentialId: string) {
    if (!token) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiPost(`/credentials/revoke/${credentialId}`, token);
      await refresh(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao revogar");
      setBusy(false);
    }
  }

  return (
    <AppShell active="secretaria" meta="Secretaria · piloto RF1">
      <header className="page-hero">
        <p className="eyebrow">Cadastro · single church</p>
        <h1>Secretaria</h1>
        <p className="lede">
          Lista e registra membresias em {churchName}. Emite ou revoga
          carteirinha com QR opaco — sem CPF/telefone no token.
        </p>
      </header>

      {!token ? (
        <section className="panel" aria-label="Login secretaria">
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
        <>
          <section className="panel" aria-label="Novo cadastro">
            <h2>Novo membro (fictício)</h2>
            <form className="stack-form" onSubmit={handleRegister}>
              <label>
                Nome de exibição
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                />
              </label>
              <label>
                E-mail (opcional)
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={busy}
              >
                Cadastrar membresia
              </button>
            </form>
          </section>

          <section className="panel" aria-label="Lista de membresias">
            <div className="panel-head">
              <h2>Membresias — {churchName}</h2>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => void refresh(token)}
              >
                Atualizar
              </button>
            </div>
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            {rows.length === 0 ? (
              <p className="muted">Nenhuma membresia (rode o seed + API).</p>
            ) : (
              <ul className="member-list">
                {rows.map((row) => (
                  <li key={row.id}>
                    <div>
                      <strong>{row.person.displayName}</strong>
                      <span className="muted">
                        {" "}
                        · {row.status}
                        {row.person.email ? ` · ${row.person.email}` : ""}
                      </span>
                    </div>
                    <div className="row-actions">
                      {row.activeCredentialId ? (
                        <button
                          type="button"
                          className="btn btn-accent"
                          disabled={busy}
                          onClick={() =>
                            void handleRevoke(row.activeCredentialId!)
                          }
                        >
                          Revogar carteirinha
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={busy}
                          onClick={() => void handleIssue(row.id)}
                        >
                          Emitir carteirinha
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <p className="pages-caveat">
        GitHub Pages exporta este HTML estático, mas{" "}
        <strong>não hospeda a API</strong>. Demo completa:{" "}
        <code>npm run dev:api</code> + <code>npm run dev:web</code> (ou
        Hostinger depois).
      </p>
    </AppShell>
  );
}
