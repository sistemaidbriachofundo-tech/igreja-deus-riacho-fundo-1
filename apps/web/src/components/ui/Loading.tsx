import styles from "./ui.module.css";

type LoadingProps = {
  label?: string;
  variant?: "spinner" | "skeleton";
};

export function Loading({ label = "Carregando", variant = "spinner" }: LoadingProps) {
  if (variant === "skeleton") {
    return (
      <div className={styles.loading} role="status" aria-live="polite">
        <span>{label}</span>
        <div className={styles.skeleton} aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.loading} role="status" aria-live="polite">
      <span className={styles.spinner} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
