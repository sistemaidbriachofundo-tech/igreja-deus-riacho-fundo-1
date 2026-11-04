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
      <path
        fill="currentColor"
        opacity="0.9"
        d="M15.6 5.2c1.3 1.05 2.2 2.55 2.2 4.2 0 1.1-.4 2-.95 2.7-.55-1.7-1.6-3.1-3.05-4.05.55-.95 1.2-1.9 1.8-2.85z"
      />
    </svg>
  );
}

function IconDemo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none">
      <path d="M12 2l2.1 7.3L21.5 12l-7.4 2.7L12 22l-2.1-7.3L2.5 12l7.4-2.7L12 2Z"
        stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

function IconOverview() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none">
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function IconPeople() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none">
      <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M3.5 19c.6-3 2.7-4.5 5.5-4.5S14 16 14.5 19"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="16.5" cy="9" r="2.4" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M15 14.6c2 .3 3.6 1.5 4.2 4.4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconSec() {
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

function IconCard() {
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

/** Chaves alinhadas ao menu PRINCIPAL do protótipo v5 (escopo F2). */
export type AppNavKey = "visao" | "membros" | "secretaria" | "carteirinha" | "demo";

const NAV: {
  key: AppNavKey;
  href: string;
  label: string;
  short: string;
  Icon: () => ReactNode;
}[] = [
  { key: "visao", href: "/app/", label: "Visão geral", short: "Início", Icon: IconOverview },
  {
    key: "membros",
    href: "/app/membros/",
    label: "Membros e famílias",
    short: "Pessoas",
    Icon: IconPeople,
  },
  {
    key: "secretaria",
    href: "/app/secretaria/",
    label: "Secretaria",
    short: "Secretaria",
    Icon: IconSec,
  },
  {
    key: "carteirinha",
    href: "/app/membros/carteirinha/",
    label: "Carteirinhas",
    short: "Carteira",
    Icon: IconCard,
  },
  {
    key: "demo", href: "/app/demo/", label: "Explorar demonstração",
    short: "Testar", Icon: IconDemo,
  },
];

export function AppShell({
  active,
  meta,
  children,
}: {
  active?: AppNavKey | null;
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
            <p className="brand-name">Igreja de Deus</p>
            <p className="brand-tag">no Riacho Fundo I</p>
          </div>
        </div>

        <p className="side-caption">Gestão da igreja</p>

        <nav className="sidebar-nav" aria-label="Módulos">
          {NAV.map(({ key, href, label, Icon }) => (
            <a
              key={key}
              className={`nav-item${active === key ? " is-active" : ""}`}
              href={withBasePath(href)}
              aria-current={active === key ? "page" : undefined}
            >
              <Icon />
              {label}
            </a>
          ))}
        </nav>

        <p className="sidebar-foot">
          <a href={withBasePath("/")}>← Site público</a>
          <span>Plataforma em implantação</span>
        </p>
      </aside>

      <nav className="mobile-bottom-nav" aria-label="Navegação principal no celular">
        {NAV.map(({ key, href, short, Icon }) => (
          <a key={key}
            className={`mobile-bottom-link${active === key ? " is-active" : ""}`}
            href={withBasePath(href)}
            aria-current={active === key ? "page" : undefined}>
            <Icon />
            <span>{short}</span>
          </a>
        ))}
      </nav>

      <div className="shell-main">
        <header className="topbar">
          <div className="topbar-left">
            <p className="topbar-title">{APP_NAME}</p>
            <span className="preview-chip" title="Ambiente demonstrativo">
              Ambiente em implantação
            </span>
          </div>
          <p className="topbar-meta">{meta}</p>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
