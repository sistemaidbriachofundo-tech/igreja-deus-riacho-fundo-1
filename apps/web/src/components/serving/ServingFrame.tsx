"use client";

import type { ReactNode } from "react";
import { clearToken } from "../../lib/api";
import { withBasePath } from "../../lib/paths";
import { BLOCKED_INTEGRATIONS, type ServingSurfaceId } from "../../lib/serving-rosters";
import styles from "./serving.module.css";

const LINKS: Array<{ id: ServingSurfaceId | "membro"; href: string; label: string }> = [
  { id: "atmosfera", href: "/app/servir/atmosfera/", label: "Atmosfera" },
  { id: "louvor", href: "/app/servir/louvor/", label: "Louvor" },
  { id: "membro", href: "/app/servir/meu-espaco/", label: "Meu Espaço" },
];

export function ServingFrame({
  active,
  title,
  lead,
  children,
}: {
  active: ServingSurfaceId | "membro";
  title: string;
  lead: string;
  children: ReactNode;
}) {
  return (
    <main className={styles.page}>
      <header className={styles.top}>
        <div>
          <p className={styles.eyebrow}>Escalas · homologação sintética</p>
          <h1>{title}</h1>
          <p className={styles.lead}>{lead}</p>
        </div>
        <button
          type="button"
          className={styles.ghost}
          onClick={() => {
            clearToken();
            window.location.assign(withBasePath("/login/"));
          }}
        >
          Encerrar sessão neste navegador
        </button>
      </header>
      <nav className={styles.nav} aria-label="Escalas e Meu Espaço">
        {LINKS.map((link) => (
          <a
            key={link.id}
            href={withBasePath(link.href)}
            aria-current={link.id === active ? "page" : undefined}
          >
            {link.label}
          </a>
        ))}
        <a href={withBasePath("/app/operacao/")}>Operação já publicada</a>
      </nav>
      {children}
      <section className={styles.blocked} aria-label="Integrações bloqueadas">
        <h2>Integração bloqueada</h2>
        <ul>
          {BLOCKED_INTEGRATIONS.map((item) => (
            <li key={item.id}>
              <strong>{item.issue}.</strong> {item.text}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
