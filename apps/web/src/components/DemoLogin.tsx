"use client";

import { useState } from "react";
import {
  apiLogin,
  clearToken,
  loadStoredToken,
  storeToken,
} from "../lib/api";

export function DemoLogin({
  hintEmail,
  onAuthenticated,
}: {
  hintEmail: string;
  onAuthenticated: (token: string) => void;
}) {
  const [email, setEmail] = useState(hintEmail);
  const [password, setPassword] = useState("admin");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await apiLogin(email, password);
      storeToken(result.accessToken);
      onAuthenticated(result.accessToken);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Falha no login — API no ar? (localhost:3001)",
      );
    } finally {
      setBusy(false);
    }
  }

  function handleUseStored() {
    const token = loadStoredToken();
    if (token) {
      onAuthenticated(token);
    } else {
      setError("Nenhuma sessão demo salva neste navegador.");
    }
  }

  return (
    <form className="demo-login" onSubmit={handleSubmit}>
      <p className="demo-login-note">
        Demo fictícia — senha <code>admin</code>. Requer API Nest local (Pages
        estático não autentica).
      </p>
      <label>
        E-mail
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
          required
        />
      </label>
      <label>
        Senha
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </label>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Entrando…" : "Entrar"}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={handleUseStored}
        >
          Usar sessão salva
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            clearToken();
            setError(null);
          }}
        >
          Sair
        </button>
      </div>
    </form>
  );
}
