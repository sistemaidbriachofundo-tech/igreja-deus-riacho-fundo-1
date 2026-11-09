import { useId, type ReactNode } from "react";
import styles from "./ui.module.css";

export type TableColumn<T> = {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
};

type TableProps<T> = {
  caption: string;
  columns: readonly TableColumn<T>[];
  rows: readonly T[];
  getRowKey: (row: T) => string;
  empty?: ReactNode;
};

export function Table<T>({ caption, columns, rows, getRowKey, empty }: TableProps<T>) {
  const captionId = useId();
  const emptyContent = empty ?? "Nenhum registro sintético.";

  return (
    <div className={styles.tableRegion}>
      <p id={captionId} className={styles.caption}>
        {caption}
      </p>
      {rows.length === 0 ? (
        <div className={styles.mobileList}>{emptyContent}</div>
      ) : (
        <ul className={styles.mobileList} aria-labelledby={captionId}>
          {rows.map((row) => (
            <li key={getRowKey(row)} className={styles.mobileItem}>
              <dl>
                {columns.map((column) => (
                  <div key={column.id}>
                    <dt>{column.header}</dt>
                    <dd>{column.cell(row)}</dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.tableWrap} tabIndex={0} role="region" aria-labelledby={captionId}>
        <table className={styles.table}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.id} scope="col">
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length}>{emptyContent}</td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={getRowKey(row)}>
                  {columns.map((column) => (
                    <td key={column.id}>{column.cell(row)}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
