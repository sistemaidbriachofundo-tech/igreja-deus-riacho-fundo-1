import type { ReactNode } from "react";
import styles from "./ui.module.css";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  breadcrumb,
  heading = "h2",
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
  heading?: "h1" | "h2";
}) {
  const Title = heading;

  return (
    <header className={styles.pageHeaderBlock}>
      {breadcrumb}
      <div className={styles.pageHeader}>
        <div className={styles.pageHeaderCopy}>
          {eyebrow ? <p className={styles.cardEyebrow}>{eyebrow}</p> : null}
          <Title className={styles.pageTitle}>{title}</Title>
          {description ? <p className={styles.sectionIntro}>{description}</p> : null}
        </div>
        {actions ? <div className={styles.pageActions}>{actions}</div> : null}
      </div>
    </header>
  );
}
