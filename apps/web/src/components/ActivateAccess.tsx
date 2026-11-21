"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { apiPost } from "../lib/api";
import { withBasePath } from "../lib/paths";
import { officialLogoAsset } from "../lib/brand";
import { eventAuthHref } from "../lib/public-event-registration";
import s from "./activate-access.module.css";

export function ActivateAccess({ recovery = false }: { recovery?: boolean } = {}) {
  const [eventSlug, setEventSlug] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [activated, setActivated] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const uri = new URL(window.location.href);
    const fragment = new URLSearchParams(uri.hash.slice(1));
    const value = fragment.get("token") ?? uri.searchParams.get("token") ?? "";
    setEventSlug(uri.searchParams.get("evento") ?? fragment.get("evento"));
    setToken(/^[A-Za-z0-9_-]{43}$/.test(value) ? value : "");
    // Nunca deixar tokens de redefinição no histórico do navegador.
    uri.searchParams.delete("token");
    if (fragment.has("token")) uri.hash = "";
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
      setError("Não foi possível concluir. O link pode ter expirado, já ter sido utilizado ou a senha não atender à política. Solicite outro link.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={s.page} id="conteudo">
      <Link href="/" className={s.back}>← Voltar ao site da igreja</Link>
      <div className={s.layout}>
        <section className={s.card} aria-labelledby="activation-title">
          <div className={s.brand}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={withBasePath(officialLogoAsset)} alt="" width={48} height={54} />
            <div><strong>IGREJA DE DEUS</strong><span>RIACHO FUNDO I</span></div>
          </div>
          <div className={s.heading}>
            <h1 id="activation-title">
              {activated ? (recovery ? "Senha redefinida!" : "Acesso ativado!")
                : (recovery ? "Redefina sua senha" : "Crie sua senha de acesso")}
            </h1>
            <p>{activated ? "Agora você pode entrar com sua nova senha." : "Seu acesso é pessoal e protegido."}</p>
          </div>

          {activated ? (
            <div className={s.feedback} role="status">
              <strong>Concluído com sucesso.</strong>
              <p>Sua senha foi cadastrada. Entre com o e-mail da sua conta.</p>
              <a className={s.primary} href={withBasePath(recovery ? eventAuthHref("/login/", eventSlug) : "/app/")}>Entrar no sistema</a>
            </div>
          ) : token === null ? (
            <p role="status">Verificando o link…</p>
          ) : !token ? (
            <div className={s.feedback} role="alert">
              <strong>Este link não é válido.</strong>
              <p>Ele pode ter expirado ou já ter sido utilizado.</p>
              {recovery ? <Link href={eventAuthHref("/recuperar-senha/", eventSlug)}>Solicitar um novo link</Link>
                : <p>Peça à administração que envie outro link.</p>}
            </div>
          ) : (
            <>
              <p className={s.intro}>Escolha uma senha que só você conheça. A liderança não precisa ter acesso a ela.</p>
              <form className={s.form} onSubmit={submit}>
                <label htmlFor="new-password">Nova senha</label>
                <input id="new-password" type="password" name="password" autoComplete="new-password" required minLength={14} maxLength={128}
                  value={password} onChange={event => setPassword(event.target.value)} />
                <label htmlFor="confirm-new-password">Confirme a nova senha</label>
                <input id="confirm-new-password" type="password" name="confirm-password" autoComplete="new-password" required minLength={14} maxLength={128}
                  value={confirmation} onChange={event => setConfirmation(event.target.value)} />
                <p className={s.hint}>Use entre 14 e 128 caracteres, incluindo letras maiúsculas, minúsculas e números. Não utilize partes do seu e-mail.</p>
                {error && <p className={s.error} role="alert">{error}</p>}
                <button type="submit" className={s.primary} disabled={loading || password.length < 14 || password !== confirmation} aria-busy={loading}>
                  {loading ? "Salvando…" : "Definir minha senha"}
                </button>
              </form>
            </>
          )}
          <p className={s.footer}>Link pessoal, temporário e de uso único.</p>
        </section>
      </div>
    </main>
  );
}
