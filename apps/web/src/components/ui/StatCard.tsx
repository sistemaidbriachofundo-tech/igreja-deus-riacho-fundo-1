import styles from "./ui.module.css";

type StatTone = "neutral" | "success" | "warning" | "danger";

const toneClass: Record<StatTone, string> = {
  neutral: styles.statNeutral,
  success: styles.statSuccess,
  warning: styles.statWarning,
  danger: styles.statDanger,
};

const toneText: Record<StatTone, string> = {
  neutral: "",
  success: "Situação positiva.",
  warning: "Requer atenção.",
  danger: "Situação crítica.",
};

export function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: StatTone;
}) {
  return (
    <article className={[styles.kpi, styles.stat, toneClass[tone]].join(" ")}>
      <p className={styles.kpiLabel}>{label}</p>
      <p className={styles.kpiValue}>{value}</p>
      {hint ? <p className={styles.kpiHint}>{hint}</p> : null}
      {toneText[tone] ? <p className={styles.srOnly}>{toneText[tone]}</p> : null}
    </article>
  );
}
