import type { ReactNode } from "react";
import styles from "./ui.module.css";

type AlertTone = "info" | "success" | "warning" | "danger";

const toneClass: Record<AlertTone, string> = {
  info: styles.alertInfo,
  success: styles.alertSuccess,
  warning: styles.alertWarning,
  danger: styles.alertDanger,
};

const toneMark: Record<AlertTone, string> = {
  info: "i",
  success: "✓",
  warning: "!",
  danger: "!",
};

export function Alert({
  tone,
  title,
  children,
  onDismiss,
  appearance = "default",
}: {
  tone: AlertTone;
  title: string;
  children?: ReactNode;
  onDismiss?: () => void;
  appearance?: "default" | "workspace";
}) {
  const assertive = tone === "warning" || tone === "danger";
  const workspace = appearance === "workspace";

  return (
    <div
      className={`${styles.alert} ${toneClass[tone]}${workspace ? ` ${styles.workspaceAlert}` : ""}`}
      role={assertive ? "alert" : "status"}
      data-tone={tone}
      aria-atomic="true"
    >
      {workspace && (
        <span className={styles.alertMark} aria-hidden="true">
          {toneMark[tone]}
        </span>
      )}
      <div className={styles.alertCopy}>
        <strong>{title}</strong>
        {children && <div>{children}</div>}
      </div>
      {onDismiss ? (
        <button
          type="button"
          className={workspace ? styles.alertDismiss : styles.target}
          onClick={onDismiss}
          aria-label={workspace ? "Fechar aviso" : undefined}
        >
          {workspace ? <span aria-hidden="true">×</span> : "Fechar aviso"}
        </button>
      ) : null}
    </div>
  );
}
