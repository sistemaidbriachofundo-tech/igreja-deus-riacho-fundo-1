import type { ReactNode } from "react";
import styles from "./ui.module.css";

type AlertTone = "info" | "success" | "warning" | "danger";

const toneClass: Record<AlertTone, string> = {
  info: styles.alertInfo,
  success: styles.alertSuccess,
  warning: styles.alertWarning,
  danger: styles.alertDanger,
};

export function Alert({
  tone,
  title,
  children,
  onDismiss,
}: {
  tone: AlertTone;
  title: string;
  children: ReactNode;
  onDismiss?: () => void;
}) {
  const assertive = tone === "warning" || tone === "danger";

  return (
    <div className={[styles.alert, toneClass[tone]].join(" ")} role={assertive ? "alert" : "status"}>
      <div className={styles.alertCopy}>
        <strong>{title}</strong>
        <div>{children}</div>
      </div>
      {onDismiss ? (
        <button type="button" className={styles.target} onClick={onDismiss}>
          Fechar aviso
        </button>
      ) : null}
    </div>
  );
}
