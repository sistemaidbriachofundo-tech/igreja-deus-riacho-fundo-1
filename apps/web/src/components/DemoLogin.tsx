"use client";

import { useState } from "react";
import { apiLogin, storeToken } from "../lib/api";
import { withBasePath } from "../lib/paths";

/**
 * Login técnico apenas em DEV ou quando uma URL de API for configurada.
 * Não mostrar formulário operacional no GitHub Pages sem backend.
 */
export function DemoLogin({
  hintEmail,
  onAuthenticated,
}: {
  hintEmail: string;
  onAuthenticated: (token: string) => void;
}) {
  const [email, setEmail] = useState(hintEmail);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const apiConfigured = Boolean(process.env.NEXT_PUBLIC_API_URL) || process.env.NODE_ENV === "development";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!apiConfigured) return;
    setBusy(true);
    setError(null);
    try {
      const result = await apiLogin(email, password);
      storeToken(result.accessToken);
      onAuthenticated(result.accessToken);
    } catch {
      setError("Não foi possível autenticar. Confira a API, a conta e a senha de teste.");
    } finally {
      setBusy(false);
    }
  }

  if (!apiConfigured) {
    return (
      <div className="demo-login" role="note">
        <p className="demo-login-note">A entrada com usuário e senha ainda não está conectada neste site público. O modo de demonstração permite navegar com dados fictícios.</p>
        <a className="btn btn-primary" href={withBasePath("/app/demo/")}>Abrir demonstração</a>
      </div>
    );
  }

  return (
    <form className="demo-login" onSubmit={handleSubmit}>
      <p className="demo-login-note">Acesso técnico ao ambiente configurado. Utilize exclusivamente contas de desenvolvimento até a homologação da autenticação.</p>
      <label>
        E-mail
        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required />
      </label>
      <label>
        Senha
        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" placeholder="Senha de desenvolvimento" required />
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Verificando..." : "Entrar no ambiente"}</button>
      </div>
    </form>
  );
}
