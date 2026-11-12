"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  apiGet, clearToken, isForbidden, isUnauthorized,
  loadStoredToken, readValidatedSession, SESSION_UNAUTHORIZED_EVENT, type LoginResult,
} from "../lib/api";
import { withBasePath } from "../lib/paths";
import { LoginScreen } from "./LoginScreen";
import styles from "./login-screen.module.css";

type Access = "checking" | "authorized" | "unauthorized" | "forbidden" | "unavailable";

/**
 * Proteção visual das rotas /app no export estático do GitHub Pages.
 * Segurança de dados e permissões continua obrigatória no backend.
 */
export function AdminAccessGate({ children }: { children: ReactNode }) {
  const enabled = process.env.NEXT_PUBLIC_HML_ENABLED === "true";
  const [access, setAccess] = useState<Access>("checking");
  const [attempt, setAttempt] = useState(0);

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
      setAccess("authorized");
      return;
    }
    let cancelled = false;
    setAccess("checking");
    void apiGet<LoginResult["user"]>("/auth/me", token)
      .then(() => { if (!cancelled) setAccess("authorized"); })
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
    return <SessionGateNotice mode="checking" />;
  }
  if (access === "forbidden") {
    return <SessionGateNotice mode="forbidden" onSignOut={() => { clearToken(); setAccess("unauthorized"); }} />;
  }
  if (access === "unavailable") {
    return <SessionGateNotice mode="unavailable" onRetry={() => setAttempt(value => value + 1)} onSignOut={() => { clearToken(); setAccess("unauthorized"); }} />;
  }
  if (access === "unauthorized") {
    return <LoginScreen onAuthenticated={() => setAccess("authorized")} />;
  }
  return <>{children}</>;
}

export function SessionGateNotice({
  mode, onRetry, onSignOut,
}: {
  mode: "checking" | "forbidden" | "unavailable";
  onRetry?: () => void;
  onSignOut?: () => void;
}) {
  // Primeira validação: spinner acessível, sem expor estados técnicos de sessão.
  if (mode === "checking") {
    return <main className={styles.waiting} role="status" aria-label="Carregando painel" aria-live="polite">
      <span className={styles.waitingSpinner} aria-hidden="true"/>
      <h1 className={styles.srOnly}>Carregando painel</h1>
    </main>;
  }
  const copy = mode === "forbidden"
    ? {
      title: "Seu perfil não pode abrir esta área.",
      detail: "A sessão continua válida, mas o servidor não autorizou o painel. Nenhuma informação administrativa foi exibida.",
    }
    : {
        title: "Não conseguimos confirmar a sessão.",
        detail: "A conexão demorou ou falhou. Você não foi desconectado.",
      };
  return <main className={styles.waiting} role={mode === "checking" ? "status" : "alert"} aria-live="polite">
    <span className={styles.waitingIcon} aria-hidden="true">✦</span>
    <h1>{copy.title}</h1>
    <p>{copy.detail}</p>
    {mode !== "checking" && <div className={styles.gateActions}>
      {mode === "unavailable" && onRetry && <button type="button" className={styles.retry} onClick={onRetry}>Tentar de novo</button>}
      <a className={styles.gateLink} href={withBasePath("/")}>Voltar ao site</a>
      {onSignOut && <button type="button" className={styles.gateLinkButton} onClick={onSignOut}>Sair da sessão</button>}
    </div>}
  </main>;
}
