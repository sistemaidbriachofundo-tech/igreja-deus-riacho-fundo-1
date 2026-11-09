"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiGet, apiLogin, clearToken, loadStoredToken, storeToken, type LoginResult } from "../lib/api";
import { withBasePath } from "../lib/paths";
import { authenticatedLanding } from "../lib/auth-destination";
import styles from "./login-screen.module.css";

type Props = { onAuthenticated?: () => void };
type Me = LoginResult["user"];

function safeLoginError(error: unknown): string {
  if (!(error instanceof Error)) return "Não foi possível entrar. Tente novamente.";
  if (/401|403|credencial|senha|autentica|invalid/i.test(error.message)) {
    return "E-mail ou senha não autorizados. Confira seus dados.";
  }
  if (/429|limite|rate/i.test(error.message)) return "Muitas tentativas. Tente novamente mais tarde.";
  return "Não foi possível conectar ao serviço de acesso. Tente novamente.";
}

export function LoginScreen({ onAuthenticated }: Props) {
  const enabled = process.env.NEXT_PUBLIC_HML_ENABLED === "true";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  // Na rota /login, uma sessão válida leva diretamente ao painel.
  // Quando usado pelo gate, essa validação já ocorreu no componente pai.
  useEffect(() => {
    if (onAuthenticated || !enabled) return;
    const token = loadStoredToken();
    if (!token) return;
    let cancelled = false;
    setChecking(true);
    void apiGet<Me>("/auth/me", token)
      .then(user => {
        if (!cancelled) window.location.replace(withBasePath(authenticatedLanding(user)));
      })
      .catch(() => {
        clearToken();
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
      // Só grava a sessão quando o token também passou em /auth/me.
      const authenticatedUser = await apiGet<Me>("/auth/me", login.accessToken);
      storeToken(login.accessToken);
      setPassword("");
      if (onAuthenticated) onAuthenticated();
      else window.location.assign(withBasePath(authenticatedLanding(authenticatedUser)));
    } catch (problem) {
      clearToken();
      setPassword("");
      setError(safeLoginError(problem));
    } finally {
      setBusy(false);
    }
  }, [busy, email, enabled, onAuthenticated, password]);

  return (
    <main className={styles.page} id="conteudo">
      <Link className={styles.back} href="/">← Voltar ao site da igreja</Link>
      <div className={styles.layout}>
        <aside className={styles.story} aria-label="Identidade da Igreja de Deus">
          <div className={styles.brand}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={withBasePath("/images/logo-igreja-aprovada.webp")} alt="Igreja de Deus — Riacho Fundo I" width={64} height={64}/>
            <div><strong>IGREJA DE DEUS</strong><span>RIACHO FUNDO I</span></div>
          </div>
          <div className={styles.storyContent}>
            <span className={styles.eyebrow}>ID RIACHO 1 · PLATAFORMA DE GESTÃO</span>
            <h1>Uma igreja.<br/><em>Um propósito.</em><br/>Uma gestão que cuida.</h1>
            <p>O cuidado com as pessoas também está nos detalhes de como servimos, organizamos e protegemos suas histórias.</p>
          </div>
          <span className={styles.footerMark}>IGREJA DE DEUS · FÉ, COMUNHÃO E SERVIÇO</span>
        </aside>
        <section className={styles.panel} aria-labelledby="login-heading">
          <div className={styles.panelInner}>
            <div className={styles.sectionNumber}><span>ÁREA RESTRITA</span><span>01 / ACESSO</span></div>
            <div className={styles.heading}>
              <span className={styles.kicker}>BEM-VINDO AO ID RIACHO 1</span>
              <h2 id="login-heading">Entre na sua conta.</h2>
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
              {error&&<p className={styles.error} role="alert">{error}</p>}
              {!enabled&&<p className={styles.warning} role="status">O acesso autenticado ainda não está habilitado nesta publicação. Nenhuma credencial será enviada.</p>}
              <button className={styles.submit} type="submit" disabled={!enabled||busy||checking}>
                {checking?"Validando sessão…":busy?"Verificando credenciais…":"Entrar no painel"}
                <span aria-hidden="true">→</span>
              </button>
            </form>
            <div className={styles.protection}>
              <span className={styles.protectionIcon} aria-hidden="true">✦</span>
              <div><strong>Seu acesso é individual.</strong>
                <p>A plataforma valida a sessão e as permissões antes de abrir o painel. O uso de dados reais depende de autorização institucional.</p>
              </div>
            </div>
            <p className={styles.bottom}>Não possui acesso? Procure a secretaria ou a administração da igreja.</p>
          </div>
        </section>
      </div>
    </main>
  );
}
