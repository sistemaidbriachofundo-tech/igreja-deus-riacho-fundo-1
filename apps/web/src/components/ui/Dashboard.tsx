import type { ReactNode } from "react";
import styles from "./ui.module.css";

type DashboardPageProps = {
  title: string;
  lede?: string;
  actions?: ReactNode;
  children: ReactNode;
};

export function DashboardPage({ title, lede, actions, children }: DashboardPageProps) {
  return (
    <section className={styles.page} aria-label={title}>
      <header className={styles.pageHeader}>
        <div>
          <h2 className={styles.pageTitle}>{title}</h2>
          {lede ? <p className={styles.sectionIntro}>{lede}</p> : null}
        </div>
        {actions ? <div className={styles.pageActions}>{actions}</div> : null}
      </header>
      {children}
    </section>
  );
}

export function KpiGrid({ children }: { children: ReactNode }) {
  return <div className={styles.kpiGrid}>{children}</div>;
}

export function KpiCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <article className={styles.kpi}>
      <p className={styles.kpiLabel}>{label}</p>
      <p className={styles.kpiValue}>{value}</p>
      {hint ? <p className={styles.kpiHint}>{hint}</p> : null}
    </article>
  );
}

export function FilterBar({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.filterBar} aria-label={label}>
      {children}
    </div>
  );
}

type BadgeTone = "neutral" | "success" | "warning" | "danger";

const badgeClass: Record<BadgeTone, string> = {
  neutral: styles.badgeNeutral,
  success: styles.badgeSuccess,
  warning: styles.badgeWarning,
  danger: styles.badgeDanger,
};

export function StatusBadge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  return <span className={[styles.badge, badgeClass[tone]].join(" ")}>{children}</span>;
}

export function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className={styles.empty}>
      <strong>{title}</strong>
      <p>{message}</p>
    </div>
  );
}
