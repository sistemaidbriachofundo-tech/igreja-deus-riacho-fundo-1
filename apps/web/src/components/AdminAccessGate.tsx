"use client";

import { useEffect, useState, type ReactNode } from "react";
import { apiGet, clearToken, loadStoredToken, type LoginResult } from "../lib/api";
import { LoginScreen } from "./LoginScreen";
import styles from "./login-screen.module.css";

type Access = "checking" | "authorized" | "unauthorized";

/**
 * Proteção visual das rotas /app no export estático do GitHub Pages.
 * Segurança de dados e permissões continua obrigatória no backend.
 */
export function AdminAccessGate({ children }: { children: ReactNode }) {
  const enabled = process.env.NEXT_PUBLIC_HML_ENABLED === "true";
  const [access, setAccess] = useState<Access>("checking");

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
    let cancelled = false;
    void apiGet<LoginResult["user"]>("/auth/me", token)
      .then(() => { if (!cancelled) setAccess("authorized"); })
      .catch(() => {
        clearToken();
        if (!cancelled) setAccess("unauthorized");
      });
    return () => { cancelled = true; };
  }, [enabled]);

  if (access === "checking") {
    return <main className={styles.waiting} role="status" aria-live="polite">
      <span className={styles.waitingIcon} aria-hidden="true">✦</span>
      <h1>Verificando seu acesso…</h1>
      <p>Antes de abrir a área administrativa, confirmamos sua sessão.</p>
    </main>;
  }

  if (access === "unauthorized") {
    return <LoginScreen onAuthenticated={() => setAccess("authorized")}/>;
  }

  return <>{children}</>;
}
