"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiPost } from "../lib/api";
import { withBasePath } from "../lib/paths";
import s from "./activate-access.module.css";

export function ActivateAccess({ recovery = false }: { recovery?: boolean } = {}) {
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [activated, setActivated] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const uri = new URL(window.location.href);
    const value = new URLSearchParams(uri.hash.slice(1)).get("token") ?? uri.searchParams.get("token") ?? "";
    setToken(/^[A-Za-z0-9_-]{43}$/.test(value) ? value : "");
    // Remove o segredo do histórico/endereço visível logo após capturá-lo.
    uri.searchParams.delete("token");
    if (new URLSearchParams(uri.hash.slice(1)).has("token")) uri.hash = "";
    window.history.replaceState(window.history.state, "", uri.pathname + uri.search + uri.hash);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || loading || password !== confirmation) {
      setError("Confira a senha e a confirmação.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await apiPost(recovery ? "/auth/reset-password" : "/auth/activate-invite", "", { token, password }, { timeoutMs: 20_000 });
      setToken("");
      setPassword("");
      setConfirmation("");
      setActivated(true);
    } catch {
      setError("Não foi possível ativar. O link pode ter expirado, já ter sido utilizado ou a senha não atender à política. Solicite outro link à administração.");
    } finally {
      setLoading(false);
    }
  }

  return <main className={s.page}>
    <div className={s.brand}>IGREJA DE DEUS · RIACHO FUNDO I</div>
    <section className={s.card} aria-labelledby="activation-title">
      <div className={s.decoration} aria-hidden="true">✦</div>
      <span className={s.eyebrow}>SEU ACESSO, SUA SEGURANÇA</span>
      <h1 id="activation-title">{activated ? (recovery ? "Senha redefinida!" : "Acesso ativado!") : (recovery ? "Redefina sua senha" : "Crie sua senha de acesso")}</h1>
      {activated ? <>
        <p>Sua senha foi cadastrada com sucesso. Agora você já pode entrar no sistema com o e-mail da sua conta.</p>
        <a className={s.primary} href={withBasePath("/app/")}>Entrar no sistema</a>
      </> : token === null ? <p role="status">Verificando o convite…</p>
      : !token ? <>
        <p role="alert">Este link não é válido. Ele pode ter expirado ou já ter sido utilizado.</p>
        <p>Peça à administração da igreja que envie um novo link.</p>
      </> : <>
        <p>Escolha uma senha pessoal. Ninguém da administração precisa conhecer essa senha.</p>
        <form className={s.form} onSubmit={submit}>
          <label>Nova senha
            <input type="password" name="password" autoComplete="new-password" required minLength={14} maxLength={128}
              value={password} onChange={e => setPassword(e.target.value)}/>
          </label>
          <label>Confirme a nova senha
            <input type="password" name="confirm-password" autoComplete="new-password" required minLength={14} maxLength={128}
              value={confirmation} onChange={e => setConfirmation(e.target.value)}/>
          </label>
          <p className={s.hint}>Use de 14 a 128 caracteres, com letra maiúscula, minúscula e número, sem espaços ou partes do seu e-mail. Evite senhas comuns.</p>
          {error && <p className={s.error} role="alert">{error}</p>}
          <button type="submit" className={s.primary} disabled={loading || password.length < 14 || password !== confirmation}>
            {loading ? "Ativando…" : "Definir minha senha"}
          </button>
        </form>
      </>}
    </section>
    <p className={s.footer}>Sistema Riacho 1 · Seu link é pessoal, temporário e de uso único.</p>
  </main>;
}
