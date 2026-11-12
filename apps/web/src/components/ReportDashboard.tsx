import type { ReactNode } from "react";
import { AppNavLink, UIIcon } from "./AppShell";
import s from "./report-dashboard.module.css";

const number = new Intl.NumberFormat("pt-BR");

export type ReportRow = {
  label: string;
  value: number;
  detail?: string;
  tone?: "green" | "teal" | "gold" | "slate";
  href?: string;
};

export function ReportDashboard({ children }: { children: ReactNode }) {
  return <div className={s.dashboard}>{children}</div>;
}

export function ReportHeadline({ label, value, children }: { label: string; value: number | null; children?: ReactNode }) {
  return <section className={s.headline} aria-label={label}>
    <div><p>{label}</p><strong>{value === null ? "—" : number.format(value)}</strong></div>
    {children && <div className={s.headlineDetails}>{children}</div>}
  </section>;
}

export function ReportMetric({ label, value, href }: { label: string; value: number | null; href?: string }) {
  const content = <><span>{label}</span><strong>{value === null ? "—" : number.format(value)}</strong></>;
  return href
    ? <AppNavLink href={href} className={s.metric}>{content}<UIIcon name="arrow" size={16} /></AppNavLink>
    : <div className={s.metric}>{content}</div>;
}

export function ReportBars({ title, description, rows, total, loading }: {
  title: string;
  description?: string;
  rows: ReportRow[] | null;
  total?: number;
  loading?: boolean;
}) {
  const scale = Math.max(1, total ?? Math.max(0, ...(rows ?? []).map(row => row.value)));
  return (
    <section className={s.panel} aria-label={title}>
      <header><h2>{title}</h2>{description && <p>{description}</p>}</header>
      {rows === null ? <p className={s.empty} role="status">{loading ? "Consultando os dados…" : "Dados indisponíveis."}</p>
        : !rows.length ? <p className={s.empty}>Nenhum registro para exibir.</p>
        : <ul className={s.bars}>
          {rows.map((row, index) => {
            const contents = <>
              <span className={s.barCaption}><span>{row.label}{row.detail && <small>{row.detail}</small>}</span><strong>{number.format(row.value)}</strong>{row.href && <UIIcon name="chevron" size={14} />}</span>
              <span className={s.track} aria-hidden="true"><i style={{ width: `${Math.min(100, row.value / scale * 100)}%` }} /></span>
            </>;
            return <li key={row.href ?? row.label} data-tone={row.tone ?? (["green", "teal", "gold", "slate"] as const)[index % 4]}>
              {row.href ? <AppNavLink className={s.barRow} href={row.href}>{contents}</AppNavLink> : <div className={s.barRow}>{contents}</div>}
            </li>;
          })}
        </ul>}
    </section>
  );
}
