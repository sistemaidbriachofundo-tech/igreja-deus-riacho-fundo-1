import type { ReactNode } from "react";
import styles from "./ui.module.css";

type CardProps = {
  title?: string;
  eyebrow?: string;
  children: ReactNode;
  footer?: ReactNode;
};

export function Card({ title, eyebrow, children, footer }: CardProps) {
  return (
    <article className={styles.card}>
      {eyebrow ? <p className={styles.cardEyebrow}>{eyebrow}</p> : null}
      {title ? <h3 className={styles.cardTitle}>{title}</h3> : null}
      <div className={styles.cardBody}>{children}</div>
      {footer ? <div className={styles.cardFooter}>{footer}</div> : null}
    </article>
  );
}
