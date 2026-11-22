import { type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminSessionContext } from "../components/AdminAccessGate";
import type { AuthUser } from "./api";

/**
 * Conta fictícia para SSR de teste. Não é token, não passa por /auth/me
 * e não representa uma pessoa da congregação.
 */
export function syntheticViewer(role: string, extras: Partial<AuthUser> = {}): AuthUser {
  return {
    userId: `fixture-${role.toLowerCase()}`,
    personId: `fixture-person-${role.toLowerCase()}`,
    email: `${role.toLowerCase()}.fixture@example.test`,
    grants: [{ roleCode: role }],
    ...extras,
  };
}

function withHomologation<T>(render: () => T): T {
  const previous = process.env.NEXT_PUBLIC_HML_ENABLED;
  process.env.NEXT_PUBLIC_HML_ENABLED = "true";
  try {
    return render();
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_HML_ENABLED;
    else process.env.NEXT_PUBLIC_HML_ENABLED = previous;
  }
}

/** Shell de homologação sem sessão: o módulo autenticado não pode aparecer. */
export function renderPending(node: ReactNode): string {
  return withHomologation(() => renderToStaticMarkup(node));
}

/** Mesmo shell, com o papel já resolvido. A autorização continua a do menu. */
export function renderAsRole(role: string, node: ReactNode): string {
  return withHomologation(() => renderToStaticMarkup(
    <AdminSessionContext.Provider value={syntheticViewer(role)}>{node}</AdminSessionContext.Provider>,
  ));
}
