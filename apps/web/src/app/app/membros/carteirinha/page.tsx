"use client";

import { containsSensitiveCredentialPayload } from "@idbrf/shared";
import { useState } from "react";
import { AppShell } from "../../../../components/AppShell";
import { DemoLogin } from "../../../../components/DemoLogin";
import { apiGet, loadStoredToken } from "../../../../lib/api";

interface CardPayload {
  id: string;
  status: string;
  displayName: string;
  churchName: string;
  qrPayload: string;
  issuedAt: string;
  revokedAt: string | null;
  personId: string;
  membershipId: string;
}

interface MeResponse {
  card: CardPayload | null;
  church: { name: string; slug: string };
}

export default function CarteirinhaPage() {
  const [token, setToken] = useState<string | null>(null);
  const [data, setData] = useState<MeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadCard(accessToken: string) {
    setBusy(true);
    setError(null);
    setToken(accessToken);
    try {
      const result = await apiGet<MeResponse>("/credentials/me", accessToken);
      if (
        result.card &&
        containsSensitiveCredentialPayload(result.card.qrPayload)
      ) {
        setError("QR inválido: payload sensível detectado (não deveria ocorrer)");
        setData(null);
        return;
      }
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar");
      setData(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell active="carteirinha" meta="Carteirinhas · piloto RF1">
      <header className="page-hero">
        <p className="eyebrow">Principal · protótipo v5</p>
        <h1>Carteirinhas</h1>
        <p className="lede">
          Carteirinha digital condicionada à membresia aprovada. QR/token opaco
          revogável — sem CPF, telefone ou dados sensíveis (DAS).
        </p>
      </header>

      {!token ? (
        <section className="panel" aria-label="Login membro">
          <h2>Acesso demo</h2>
          <DemoLogin
            hintEmail="bruno.demo@example.test"
            onAuthenticated={(t) => void loadCard(t)}
          />
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              const stored = loadStoredToken();
              if (stored) {
                void loadCard(stored);
              }
            }}
          >
            Tentar sessão já salva
          </button>
        </section>
      ) : (
        <section className="panel" aria-label="Carteirinha">
          <div className="panel-head">
            <h2>{data?.church.name ?? "Riacho Fundo I"}</h2>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => token && void loadCard(token)}
            >
              Atualizar
            </button>
          </div>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          {busy && !data ? <p className="muted">Carregando…</p> : null}
          {!busy && data && !data.card ? (
            <p className="muted">
              Nenhuma carteirinha ativa. Peça emissão na Secretaria.
            </p>
          ) : null}
          {data?.card ? (
            <article className="member-card" aria-label="Carteirinha digital">
              <p className="member-card-church">{data.card.churchName}</p>
              <h3>{data.card.displayName}</h3>
              <p className="muted">Status: {data.card.status}</p>
              <div className="qr-block">
                <p className="eyebrow">QR (token opaco)</p>
                <code className="qr-payload">{data.card.qrPayload}</code>
                <p className="muted small">
                  Emitida em {new Date(data.card.issuedAt).toLocaleString("pt-BR")}
                  . O QR contém só este token — sem PII.
                </p>
              </div>
            </article>
          ) : null}
        </section>
      )}

      <p className="pages-caveat">
        No GitHub Pages esta tela existe como HTML estático, mas login e
        carteirinha precisam da API Nest (dev local ou Hostinger).
      </p>
    </AppShell>
  );
}
