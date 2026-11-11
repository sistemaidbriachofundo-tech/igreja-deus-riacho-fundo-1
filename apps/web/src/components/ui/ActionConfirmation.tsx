"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./ui.module.css";

type Confirmation = {
  title: string;
  description: string;
  action: string;
  cancel?: string;
  subject?: string;
  tone?: "normal" | "danger";
};

function ActionConfirmation({
  details,
  onAnswer,
}: {
  details: Confirmation;
  onAnswer: (accepted: boolean) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const subjectId = useId();
  const destructive = details.tone === "danger";

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    cancelRef.current?.focus();
    return () => dialog.close();
  }, []);

  function answer(accepted: boolean) {
    dialogRef.current?.close();
    onAnswer(accepted);
  }

  return createPortal(
    <dialog
      ref={dialogRef}
      className={styles.actionConfirmation}
      role={destructive ? "alertdialog" : "dialog"}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={
        details.subject ? `${subjectId} ${descriptionId}` : descriptionId
      }
      data-tone={destructive ? "danger" : "normal"}
      onCancel={(event) => {
        event.preventDefault();
        answer(false);
      }}
    >
      <div className={styles.confirmationContent}>
        <span className={styles.confirmationIcon} aria-hidden="true">
          !
        </span>
        <h2 id={titleId}>{details.title}</h2>
        {details.subject && (
          <p id={subjectId} className={styles.confirmationSubject}>
            {details.subject}
          </p>
        )}
        <p id={descriptionId} className={styles.confirmationDescription}>
          {details.description}
        </p>
      </div>
      <div className={styles.confirmationActions}>
        <button
          ref={cancelRef}
          type="button"
          className={styles.workspaceSecondary}
          onClick={() => answer(false)}
        >
          {details.cancel ?? "Cancelar"}
        </button>
        <button
          type="button"
          className={styles.workspacePrimary}
          onClick={() => answer(true)}
        >
          {details.action}
        </button>
      </div>
    </dialog>,
    document.body,
  );
}

export function useActionConfirmation() {
  const [details, setDetails] = useState<Confirmation | null>(null);
  const pending = useRef<((accepted: boolean) => void) | null>(null);

  useEffect(
    () => () => {
      pending.current?.(false);
      pending.current = null;
    },
    [],
  );

  function confirm(request: Confirmation) {
    if (pending.current) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      pending.current = resolve;
      setDetails(request);
    });
  }

  function answer(accepted: boolean) {
    const resolve = pending.current;
    pending.current = null;
    setDetails(null);
    resolve?.(accepted);
  }

  return {
    confirm,
    confirmation: details ? (
      <ActionConfirmation details={details} onAnswer={answer} />
    ) : null,
  };
}
