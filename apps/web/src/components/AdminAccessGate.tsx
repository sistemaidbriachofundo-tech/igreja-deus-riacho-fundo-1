"use client";

import { isAdminEnabled } from "../lib/admin-environment";
import { createContext, useEffect, useState, type ReactNode } from "react";
import {
  apiGet, clearToken, isForbidden, isUnauthorized,
  loadStoredToken, readValidatedSession, SESSION_UNAUTHORIZED_EVENT, type LoginResult,
} from "../lib/api";
import { withBasePath } from "../lib/paths";
import { LoginScreen } from "./LoginScreen";
import styles from "./login-screen.module.css";

type Access = "checking" | "authorized" | "unauthorized" | "forbidden" | "unavailable";
export const AdminSessionContext = createContext<LoginResult["user"] | null>(null);

/**
 * Proteção visual das rotas /app no export estático do GitHub Pages.
 * Segurança de dados e permissões continua obrigatória no backend.
 */
export function AdminAccessGate({ children }: { children: ReactNode }) {
  const enabled = isAdminEnabled();
  const [access, setAccess] = useState<Access>("checking");
  const [user, setUser] = useState<LoginResult["user"] | null>(null);
  const [attempt, setAttempt] = useState(0);

  function authorize(session: LoginResult["user"]) {
    setUser(session);
    setAccess("authorized");
  }

  useEffect(() => {
    const onLost = () => setAccess("unauthorized");
    window.addEventListener(SESSION_UNAUTHORIZED_EVENT, onLost);
    return () => window.removeEventListener(SESSION_UNAUTHORIZED_EVENT, onLost);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setAccess("unauthorized");
      return;
    }
    const token = loadStoredToken();
    if (!token) {
      setAccess("unauthorized");
      return;
    }
    const cached = readValidatedSession(token);
    if (cached) {
      authorize(cached);
      return;
    }
    let cancelled = false;
    setAccess("checking");
    void apiGet<LoginResult["user"]>("/auth/me", token)
      .then(session => { if (!cancelled) authorize(session); })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (isUnauthorized(error)) {
          clearToken();
          setAccess("unauthorized");
          return;
        }
        // 403 e falha de rede não apagam a sessão. Timeout segue o mesmo caminho.
        if (isForbidden(error)) {
          setAccess("forbidden");
          return;
        }
        setAccess("unavailable");
      });
    return () => { cancelled = true; };
  }, [attempt, enabled]);

  if (access === "checking") {
    return <SessionGateLoading />;
  }
  if (access === "forbidden") {
    return <SessionGateNotice mode="forbidden" onSignOut={() => { clearToken(); setAccess("unauthorized"); }} />;
  }
  if (access === "unavailable") {
    return <SessionGateNotice mode="unavailable" onRetry={() => setAttempt(value => value + 1)} onSignOut={() => { clearToken(); setAccess("unauthorized"); }} />;
  }
  if (access === "unauthorized") {
    return <LoginScreen onAuthenticated={authorize} />;
  }
  return <AdminSessionContext.Provider value={user}>{children}</AdminSessionContext.Provider>;
}

export function SessionGateNotice({
  mode, onRetry, onSignOut,
}: {
  mode: "forbidden" | "unavailable";
  onRetry?: () => void;
  onSignOut?: () => void;
}) {
  const copy = mode === "forbidden"
    ? {
      title: "Seu perfil não pode abrir esta área.",
      detail: "A sessão continua válida, mas o servidor não autorizou o painel. Nenhuma informação administrativa foi exibida.",
    }
    : {
        title: "Não conseguimos confirmar a sessão.",
        detail: "A conexão demorou ou falhou. Você não foi desconectado.",
      };
  return <main className={styles.waiting} role="alert">
    <span className={styles.waitingIcon} aria-hidden="true">✦</span>
    <h1>{copy.title}</h1>
    <p>{copy.detail}</p>
    <div className={styles.gateActions}>
      {mode === "unavailable" && onRetry && <button type="button" className={styles.retry} onClick={onRetry}>Tentar de novo</button>}
      <a className={styles.gateLink} href={withBasePath("/")}>Voltar ao site</a>
      {onSignOut && <button type="button" className={styles.gateLinkButton} onClick={onSignOut}>Sair da sessão</button>}
    </div>
  </main>;
}

/**
 * Estado neutro durante a conferência inicial da sessão.
 * Não revela conteúdo protegido antes da resposta da API.
 * Os estados de erro e sessão expirada seguem explícitos.
 */
function SessionGateLoading() {
  return (
    <main className={styles.sessionLoading} role="status" aria-label="Carregando área administrativa" aria-busy="true">
      <div className={styles.sessionLoadingShell} aria-hidden="true">
        <div className={styles.sessionLoadingSide}>
          <div className={styles.sessionLoadingMark} />
          <div className={styles.sessionLoadingNav} />
          <div className={styles.sessionLoadingNav} />
          <div className={styles.sessionLoadingNav} />
        </div>
        <div className={styles.sessionLoadingContent}>
          <div className={styles.sessionLoadingTop} />
          <div className={styles.sessionLoadingTitle} />
          <div className={styles.sessionLoadingCards}>
            <div /><div /><div />
          </div>
          <div className={styles.sessionLoadingBody} />
        </div>
      </div>
      <h1 className={styles.screenReaderOnly}>Carregando área administrativa</h1>
    </main>
  );
}
