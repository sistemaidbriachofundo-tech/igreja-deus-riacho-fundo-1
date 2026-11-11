"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  apiGet, apiLogin, clearToken, isInvalidSession, loadStoredToken,
  loginFailureMessage, readValidatedSession, rememberValidatedSession, storeToken, type LoginResult,
} from "../lib/api";
import { openAuthenticatedArea, publishPerfProbe } from "../lib/app-navigation";
import { useAppRouterBridge } from "../lib/use-app-router-bridge";
import { withBasePath } from "../lib/paths";
import { authenticatedLanding } from "../lib/auth-destination";
import { Alert } from "./ui/Alert";
import styles from "./login-screen.module.css";

type Props = { onAuthenticated?: () => void };
type Me = LoginResult["user"];

export function LoginScreen({ onAuthenticated }: Props) {
  const enabled = process.env.NEXT_PUBLIC_HML_ENABLED === "true";
  const RouterBridge = useAppRouterBridge();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { publishPerfProbe(); }, []);

  // Na rota /login, uma sessão já confirmada entra sem novo /auth/me.
  // Quando usado pelo gate, essa validação já ocorreu no componente pai.
  useEffect(() => {
    if (onAuthenticated || !enabled) return;
    const token = loadStoredToken();
    if (!token) return;
    const cached = readValidatedSession(token);
    if (cached) {
      openAuthenticatedArea(authenticatedLanding(cached));
      return;
    }
    let cancelled = false;
    setChecking(true);
    void apiGet<Me>("/auth/me", token)
      .then(user => {
        if (!cancelled) openAuthenticatedArea(authenticatedLanding(user));
      })
      .catch((problem: unknown) => {
        if (isInvalidSession(problem)) clearToken();
        else if (!cancelled) setError(loginFailureMessage(problem));
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => { cancelled = true; };
  }, [onAuthenticated, enabled]);

  const submit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!enabled || busy) return;
    setError("");
    setBusy(true);
    try {
      const login = await apiLogin(email.trim(), password);
      // A resposta do login já é a sessão emitida pelo servidor.
      rememberValidatedSession(login.accessToken, login.user);
      storeToken(login.accessToken);
      setPassword("");
      if (onAuthenticated) onAuthenticated();
      else openAuthenticatedArea(authenticatedLanding(login.user));
    } catch (problem) {
      if (isInvalidSession(problem)) {
        clearToken();
        setPassword("");
      }
      setError(loginFailureMessage(problem));
    } finally {
      setBusy(false);
    }
  }, [busy, email, enabled, onAuthenticated, password]);

  return (
    <main className={styles.page} id="conteudo">
      {RouterBridge ? <RouterBridge /> : null}
      <Link className={styles.back} href="/">← Voltar ao site da igreja</Link>
      <div className={styles.layout}>
        <aside className={styles.story} aria-label="Identidade da Igreja de Deus">
          <div className={styles.brand}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={withBasePath("/images/logo-igreja-aprovada.webp")} alt="Igreja de Deus — Riacho Fundo I" width={64} height={64}/>
            <div><strong>IGREJA DE DEUS</strong><span>RIACHO FUNDO I</span></div>
          </div>
          <div className={styles.storyContent}>
            <p className={styles.eyebrow}>ID Riacho 1</p>
            <p className={styles.storyTitle}>Cuidar da igreja <em>é cuidar de pessoas.</em></p>
          </div>
        </aside>
        <section className={styles.panel} aria-labelledby="login-heading">
          <div className={styles.panelInner}>
            <div className={styles.heading}>
              <h1 id="login-heading">Entre na sua conta</h1>
              <p>Use seu e-mail e sua senha para acessar o ambiente administrativo.</p>
            </div>
            <form onSubmit={submit} className={styles.form}>
              <label htmlFor="church-email">E-mail</label>
              <input id="church-email" type="email" name="email" required
                autoComplete="username" inputMode="email"
                value={email} onChange={e => setEmail(e.target.value)}
                placeholder="seu.email@exemplo.com" maxLength={254} disabled={busy||checking}/>
              <div className={styles.passwordLabel}>
                <label htmlFor="church-password">Senha</label>
              </div>
              <div className={styles.passwordControl}>
                <input id="church-password" type={showPassword?"text":"password"} name="password"
                  required autoComplete="current-password" minLength={1}
                  value={password} onChange={e=>setPassword(e.target.value)}
                  placeholder="Digite sua senha" disabled={busy||checking}/>
                <button type="button" className={styles.reveal} aria-label={showPassword?"Ocultar senha":"Mostrar senha"}
                  aria-pressed={showPassword} onClick={()=>setShowPassword(value=>!value)}
                  disabled={busy||checking}>{showPassword?"Ocultar":"Mostrar"}</button>
              </div>
              {error && <Alert appearance="workspace" tone="danger" title={error} />}
              {!enabled&&<p className={styles.warning} role="status">O acesso ao painel está indisponível neste endereço. Procure a secretaria da igreja.</p>}
              <button className={styles.submit} type="submit" disabled={!enabled||busy||checking}>
                {checking?"Validando sessão…":busy?"Entrando…":"Entrar no painel"}
                <span aria-hidden="true">→</span>
              </button>
            </form>
            <p className={styles.bottom}>Não possui acesso? Procure a secretaria ou a administração da igreja.</p>
          </div>
        </section>
      </div>
    </main>
  );
}
