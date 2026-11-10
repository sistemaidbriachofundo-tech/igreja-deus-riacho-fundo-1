"use client";

import { useId, useRef, type ReactNode } from "react";
import styles from "./ui.module.css";
import { Button } from "./Button";
import { useDialogLifecycle } from "./dialog";

type ModalProps = {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
};

export function Modal({ open, title, description, onClose, children }: ModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogLifecycle(open, onClose, dialogRef);

  if (!open) return null;

  return (
    <div className={styles.overlay} onMouseDown={() => onClose()}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className={styles.dialogHeader}>
          <h2 id={titleId}>{title}</h2>
          <Button variant="secondary" onClick={onClose} aria-label="Fechar">
            Fechar
          </Button>
        </div>
        {description ? (
          <p id={descriptionId} className={styles.dialogCopy}>
            {description}
          </p>
        ) : null}
        <div className={styles.dialogBody}>{children}</div>
      </div>
    </div>
  );
}
