"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { isAdminEnabled } from "../lib/admin-environment";
import {
  ApiRequestError, apiPostPublic, loginFailureMessage, rememberValidatedSession, storeToken, type LoginResult,
} from "../lib/api";
import { openAuthenticatedArea } from "../lib/app-navigation";
import { authenticatedLanding } from "../lib/auth-destination";
import { eventAuthHref } from "../lib/public-event-registration";
import { Alert } from "./ui/Alert";
import styles from "./login-screen.module.css";

export function GuestRegistration() {
  const available = isAdminEnabled();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [eventSlug, setEventSlug] = useState<string | null>(null);

  useEffect(() => {
    setEventSlug(new URLSearchParams(window.location.search).get("evento"));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!available || busy) return;
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password"));
    if (password !== data.get("confirmPassword")) {
      setError("As senhas precisam ser iguais.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const session = await apiPostPublic<LoginResult>("/auth/guest-registration", {
        displayName: String(data.get("displayName")).trim(),
        email: String(data.get("email")).trim(),
        password,
      });
      rememberValidatedSession(session.accessToken, session.user);
      storeToken(session.accessToken);
      openAuthenticatedArea(authenticatedLanding(session.user, new URLSearchParams(window.location.search).get("evento")));
    } catch (problem) {
      if (problem instanceof ApiRequestError && problem.status === 409) {
        setError("Se já tem acesso, entre pelo login. Se precisar de ajuda, procure a Secretaria.");
      } else if (problem instanceof ApiRequestError && problem.status === 400) {
        setError("Confira o nome, o e-mail e os requisitos da senha.");
      } else {
        setError(loginFailureMessage(problem));
      }
    } finally {
      setBusy(false);
    }
  }

  return <main className={styles.page} id="conteudo">
    <Link className={styles.back} href="/">← Voltar ao site da igreja</Link>
    <div className={styles.layout}>
      <section className={styles.panel} aria-labelledby="cadastro-title">
        <div className={styles.panelInner}>
          <div className={styles.heading}>
            <h1 id="cadastro-title">Criar conta como convidado</h1>
            <p>Veja os eventos, conheça a Trilha da Conexão e encontre um Grupo de Amizade.</p>
          </div>
          {available ? <form method="post" className={styles.form} onSubmit={submit}>
            <label htmlFor="guest-name">Nome</label>
            <input id="guest-name" name="displayName" autoComplete="name" minLength={2} maxLength={100} required />
            <label htmlFor="guest-email">E-mail</label>
            <input id="guest-email" name="email" type="email" autoComplete="email" maxLength={254} required />
            <label htmlFor="guest-password">Senha</label>
            <input id="guest-password" name="password" type="password" autoComplete="new-password"
              minLength={14} maxLength={128} aria-describedby="guest-password-help" required />
            <p className={styles.mfaHelp} id="guest-password-help">Use pelo menos 14 caracteres, incluindo maiúsculas, minúsculas e números. Evite espaços, sequências comuns e o seu e-mail.</p>
            <label htmlFor="guest-confirm-password">Repita a senha</label>
            <input id="guest-confirm-password" name="confirmPassword" type="password" autoComplete="new-password" required />
            {error && <Alert appearance="workspace" tone="danger" title={error} />}
            <button className={styles.submit} type="submit" disabled={busy}>{busy ? "Criando conta…" : "Criar conta e entrar"}</button>
          </form> : <Alert appearance="workspace" tone="warning" title="O cadastro está indisponível neste endereço." />}
          <p className={styles.bottom}>Já tem conta? <Link className={styles.gateLink} href={eventAuthHref("/login/", eventSlug)}>Entrar</Link></p>
        </div>
      </section>
    </div>
  </main>;
}
