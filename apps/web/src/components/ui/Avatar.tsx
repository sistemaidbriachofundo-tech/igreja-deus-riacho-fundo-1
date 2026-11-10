import styles from "./ui.module.css";

/** Duas iniciais, sem foto. O nome completo fica só para a tecnologia assistiva. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  const letters = parts.map((part) => Array.from(part)[0] ?? "").join("");
  return letters.toLocaleUpperCase("pt-BR") || "?";
}

export function Avatar({ name, label }: { name: string; label?: string }) {
  return (
    <span className={styles.avatar} role="img" aria-label={label ?? name}>
      <span aria-hidden="true">{initials(name)}</span>
    </span>
  );
}
