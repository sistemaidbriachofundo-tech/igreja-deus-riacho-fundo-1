import styles from "./ui.module.css";

export type Crumb = {
  label: string;
  href?: string;
};

export function Breadcrumb({ items }: { items: readonly Crumb[] }) {
  return (
    <nav className={styles.breadcrumb} aria-label="Trilha">
      <ol>
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`}>
              {last || !item.href ? (
                <span aria-current={last ? "page" : undefined}>{item.label}</span>
              ) : (
                <a href={item.href}>{item.label}</a>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
