"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  apiGet, beginLogin, beginMfaEnrollment, clearToken, isInvalidSession, loadStoredToken,
  loginFailureMessage, mfaFailureMessage, readValidatedSession, rememberValidatedSession, storeToken,
  verifyLoginChallenge, type LoginChallenge, type LoginResult, type MfaEnrollment,
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
  const [challenge, setChallenge] = useState<LoginChallenge["mfa"] | null>(null);
  const [enrollment, setEnrollment] = useState<MfaEnrollment | null>(null);
  const [code, setCode] = useState("");
  const [expired, setExpired] = useState(false);
  const codeInput = useRef<HTMLInputElement>(null);
  const needsSetup = Boolean(challenge?.enrollmentRequired && !enrollment);

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

  useEffect(() => {
    if (!challenge) return;
    const expiry = window.setTimeout(() => {
      setExpired(true);
      setEnrollment(null);
      setCode("");
    }, challenge.expiresInSeconds * 1000);
    return () => window.clearTimeout(expiry);
  }, [challenge]);

  useEffect(() => {
    if (challenge && !needsSetup && !expired) codeInput.current?.focus();
  }, [challenge, needsSetup, expired]);

  function acceptSession(login: LoginResult) {
    rememberValidatedSession(login.accessToken, login.user);
    storeToken(login.accessToken);
    setChallenge(null);
    setEnrollment(null);
    setCode("");
    setPassword("");
    if (onAuthenticated) onAuthenticated();
    else openAuthenticatedArea(authenticatedLanding(login.user));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!enabled || busy) return;
    setError("");
    setBusy(true);
    try {
      const login = await beginLogin(email.trim(), password);
      setPassword("");
      if ("accessToken" in login) acceptSession(login);
      else setChallenge(login.mfa);
    } catch (problem) {
      if (isInvalidSession(problem)) {
        clearToken();
        setPassword("");
      }
      setError(loginFailureMessage(problem));
    } finally {
      setBusy(false);
    }
  }

  async function submitChallenge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!challenge || busy || expired || (!needsSetup && !/^\d{6}$/.test(code))) return;
    setError("");
    setBusy(true);
    try {
      if (needsSetup) setEnrollment(await beginMfaEnrollment(challenge.challengeId));
      else acceptSession(await verifyLoginChallenge(challenge, code));
    } catch (problem) {
      setCode("");
      setError(mfaFailureMessage(problem));
    } finally {
      setBusy(false);
    }
  }

  function restartLogin() {
    setChallenge(null);
    setEnrollment(null);
    setCode("");
    setError("");
    setExpired(false);
  }

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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.facade} src={withBasePath("/images/fachada-igreja-riacho-fundo.jpg")} alt="Fachada da igreja" />
        </aside>
        <section className={styles.panel} aria-labelledby="login-heading">
          <div className={styles.panelInner}>
            <div className={styles.heading}>
              <h1 id="login-heading">{challenge ? "Verificação em duas etapas" : "Entre na sua conta"}</h1>
              <p>{challenge ? "Use o aplicativo autenticador para confirmar o acesso." : "Acesso ao ID Riacho 1"}</p>
            </div>
            {challenge ? <form onSubmit={submitChallenge} className={styles.form}>
              {expired ? <Alert appearance="workspace" tone="warning" title="O tempo para verificar terminou. Entre novamente." /> : <>
                {needsSetup && <p className={styles.mfaHelp}>Ative a verificação em um aplicativo autenticador antes de continuar.</p>}
                {enrollment && <div className={styles.setup}>
                  {enrollment.otpauthUri.startsWith("otpauth://totp/") && <a href={enrollment.otpauthUri}>Abrir no autenticador</a>}
                  <p>Se estiver em outro aparelho, adicione uma conta baseada em tempo usando esta chave.</p>
                  <code>{enrollment.secret}</code>
                </div>}
                {!needsSetup && <>
                  <label htmlFor="church-mfa-code">Código de 6 dígitos</label>
                  <input id="church-mfa-code" ref={codeInput} autoComplete="one-time-code" inputMode="numeric" required
                    maxLength={6} pattern="[0-9]{6}" value={code} disabled={busy}
                    onChange={event => setCode(event.target.value.replace(/\D/g, ""))} />
                </>}
                {error && <Alert appearance="workspace" tone="danger" title={error} />}
                <button className={styles.submit} type="submit" disabled={busy || (!needsSetup && code.length !== 6)}>
                  {busy ? "Verificando…" : needsSetup ? "Configurar autenticador" : "Confirmar acesso"}
                </button>
              </>}
              <button type="button" className={styles.mfaBack} disabled={busy} onClick={restartLogin}>Voltar ao login</button>
            </form> : <form onSubmit={submit} className={styles.form}>
              <label htmlFor="church-email">E-mail</label>
              <input id="church-email" type="email" name="email" required
                autoComplete="username" inputMode="email"
                value={email} onChange={e => setEmail(e.target.value)}
                maxLength={254} disabled={busy||checking}/>
              <div className={styles.passwordLabel}>
                <label htmlFor="church-password">Senha</label>
              </div>
              <div className={styles.passwordControl}>
                <input id="church-password" type={showPassword?"text":"password"} name="password"
                  required autoComplete="current-password" minLength={1}
                  value={password} onChange={e=>setPassword(e.target.value)}
                  disabled={busy||checking}/>
                <button type="button" className={styles.reveal} aria-label={showPassword?"Ocultar senha":"Mostrar senha"}
                  aria-pressed={showPassword} onClick={()=>setShowPassword(value=>!value)}
                  disabled={busy||checking}>{showPassword?"Ocultar":"Mostrar"}</button>
              </div>
              {error && <Alert appearance="workspace" tone="danger" title={error} />}
              {!enabled&&<p className={styles.warning} role="status">O acesso ao painel está indisponível neste endereço. Procure a secretaria da igreja.</p>}
              <button className={styles.submit} type="submit" disabled={!enabled||busy||checking}>
                {checking?"Validando sessão…":busy?"Entrando…":"Entrar no painel"}
              </button>
            </form>}
            <p className={styles.bottom}>Não possui acesso? Procure a secretaria ou a administração da igreja.</p>
          </div>
        </section>
      </div>
    </main>
  );
}
