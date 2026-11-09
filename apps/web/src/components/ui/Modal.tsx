"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import styles from "./ui.module.css";
import { Button } from "./Button";
import { listFocusable, nextFocusIndex } from "./focus";

function inertOutside(dialog: HTMLElement): () => void {
  const root = document.getElementById("ds-root");
  if (!root) return () => {};
  const hidden: HTMLElement[] = [];

  function walk(node: HTMLElement) {
    for (const child of Array.from(node.children)) {
      if (!(child instanceof HTMLElement)) continue;
      if (child === dialog) continue;
      if (child.contains(dialog)) {
        walk(child);
        continue;
      }
      if (!child.hasAttribute("inert")) {
        child.setAttribute("inert", "");
        hidden.push(child);
      }
    }
  }

  walk(root);
  return () => {
    for (const element of hidden) element.removeAttribute("inert");
  };
}

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
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const release = inertOutside(dialog);
    dialog.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const items = listFocusable(dialog);
      if (items.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const current = items.indexOf(document.activeElement as HTMLElement);
      const next = nextFocusIndex(current, items.length, event.shiftKey);
      event.preventDefault();
      items[next]?.focus();
    }

    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = previousOverflow;
      release();
      previous?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className={styles.overlay} onMouseDown={() => onCloseRef.current()}>
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
          <Button variant="secondary" onClick={() => onCloseRef.current()} aria-label="Fechar">
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
