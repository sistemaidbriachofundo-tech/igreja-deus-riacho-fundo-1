import type { ReactNode } from "react";
import styles from "./ui.module.css";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  breadcrumb,
  heading = "h2",
  appearance = "default",
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
  heading?: "h1" | "h2";
  appearance?: "default" | "workspace";
}) {
  const Title = heading;

  return (
    <header
      className={
        appearance === "workspace"
          ? `${styles.pageHeaderBlock} ${styles.workspaceHeader}`
          : styles.pageHeaderBlock
      }
    >
      {breadcrumb}
      <div className={styles.pageHeader}>
        <div className={styles.pageHeaderCopy}>
          {eyebrow ? <p className={styles.cardEyebrow}>{eyebrow}</p> : null}
          <Title className={styles.pageTitle}>{title}</Title>
          {description ? (
            <p className={styles.sectionIntro}>{description}</p>
          ) : null}
        </div>
        {actions ? <div className={styles.pageActions}>{actions}</div> : null}
      </div>
    </header>
  );
}
