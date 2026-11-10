import type { ReactNode } from "react";
import styles from "./ui.module.css";
import { Table, type TableColumn } from "./Table";

type DataTableProps<T> = {
  caption: string;
  columns: readonly TableColumn<T>[];
  rows: readonly T[];
  getRowKey: (row: T) => string;
  empty?: ReactNode;
  toolbar?: ReactNode;
};

export function DataTable<T>({ toolbar, ...rest }: DataTableProps<T>) {
  return (
    <div className={styles.dataTable}>
      {toolbar ? <div className={styles.dataToolbar}>{toolbar}</div> : null}
      <Table {...rest} />
    </div>
  );
}

export type { TableColumn };
