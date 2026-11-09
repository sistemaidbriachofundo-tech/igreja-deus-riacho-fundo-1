import styles from "./ui.module.css";
import { Button } from "./Button";

type ErrorStateProps = {
  title: string;
  message: string;
  onRetry?: () => void;
};

/** Componente de erro da fundação. O nome evita o construtor global Error. */
export function ErrorState({ title, message, onRetry }: ErrorStateProps) {
  return (
    <div className={styles.error} role="alert">
      <p className={styles.errorTitle}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M12 7v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M12 16.5h.01" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
        {title}
      </p>
      <p>{message}</p>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          Tentar de novo
        </Button>
      ) : null}
    </div>
  );
}
