import styles from "./ui.module.css";

export function Skeleton({ label = "Carregando conteúdo", lines = 3 }: { label?: string; lines?: number }) {
  const count = Math.max(1, Math.min(lines, 6));

  return (
    <div className={styles.loading} role="status" aria-live="polite" aria-busy="true">
      <span>{label}</span>
      <div className={styles.skeleton} aria-hidden="true">
        {Array.from({ length: count }, (_, index) => (
          <span key={index} />
        ))}
      </div>
    </div>
  );
}
