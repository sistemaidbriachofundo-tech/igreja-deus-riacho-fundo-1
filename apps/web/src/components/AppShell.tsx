import { APP_NAME } from "@idbrf/shared";
import type { ReactNode } from "react";
import { withBasePath } from "../lib/paths";

function CrossMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M10.2 3.2h3.6v6.4h6v3.6h-6v7.6h-3.6v-7.6h-6V9.6h6z"
      />
    </svg>
  );
}

function NavIconHome() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none">
      <path
        d="M4 11.2 12 4.5l8 6.7V20a1 1 0 0 1-1 1h-5.2v-5.4H10.2V21H5a1 1 0 0 1-1-1z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function NavIconSec() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none">
      <path
        d="M5 7h14M5 12h14M5 17h9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function NavIconCard() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none">
      <rect
        x="3.5"
        y="6"
        width="17"
        height="12"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M3.5 10h17"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export type AppNavKey = "home" | "secretaria" | "carteirinha";

export function AppShell({
  active,
  meta,
  children,
}: {
  active: AppNavKey;
  meta: string;
  children: ReactNode;
}) {
  return (
    <div className="shell">
      <aside className="sidebar" aria-label="Navegação principal">
        <div className="sidebar-brand">
          <div className="brand-mark" aria-hidden="true">
            <CrossMark />
          </div>
          <div className="brand-copy">
            <p className="brand-name">{APP_NAME}</p>
            <p className="brand-tag">Fé · Família · Cuidado</p>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Seções">
          <a
            className={`nav-item${active === "home" ? " is-active" : ""}`}
            href={withBasePath("/")}
            aria-current={active === "home" ? "page" : undefined}
          >
            <NavIconHome />
            Início
          </a>
          <a
            className={`nav-item${active === "secretaria" ? " is-active" : ""}`}
            href={withBasePath("/app/secretaria/")}
            aria-current={active === "secretaria" ? "page" : undefined}
          >
            <NavIconSec />
            Secretaria
          </a>
          <a
            className={`nav-item${active === "carteirinha" ? " is-active" : ""}`}
            href={withBasePath("/app/membros/carteirinha/")}
            aria-current={active === "carteirinha" ? "page" : undefined}
          >
            <NavIconCard />
            Carteirinha
          </a>
        </nav>

        <p className="sidebar-foot">
          Área /app · API local / Hostinger (não no Pages)
        </p>
      </aside>

      <div className="shell-main">
        <header className="topbar">
          <p className="topbar-title">{APP_NAME}</p>
          <p className="topbar-meta">{meta}</p>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
