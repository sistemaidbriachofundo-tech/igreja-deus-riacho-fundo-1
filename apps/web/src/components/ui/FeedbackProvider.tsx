"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import styles from "./feedback-dialog.module.css";

export type FeedbackTone = "error" | "warning" | "success" | "info";
export type FeedbackMessage = {
  tone: FeedbackTone;
  title: string;
  message: string;
  actionLabel?: string;
  /** Foca o campo específico após o usuário fechar a mensagem. */
  focusId?: string;
};

type FeedbackContextValue = { showFeedback: (message: FeedbackMessage) => void };
const FeedbackContext = createContext<FeedbackContextValue | null>(null);

/** Durante SSR isolado não há interação nem portal; no navegador exigimos o provider. */
const serverOnlyFeedback: FeedbackContextValue = { showFeedback: () => {} };

export function useFeedback(): FeedbackContextValue {
  const value = useContext(FeedbackContext);
  if (value) return value;
  if (typeof window === "undefined") return serverOnlyFeedback;
  throw new Error("FeedbackProvider precisa envolver a aplicação.");
}

const toneLabels: Record<FeedbackTone, string> = {
  error: "Atenção",
  warning: "Importante",
  success: "Concluído",
  info: "Informação",
};
const toneIcons: Record<FeedbackTone, string> = {
  error: "!",
  warning: "!",
  success: "✓",
  info: "i",
};

function FeedbackDialog({ feedback, onDismiss }: {
  feedback: FeedbackMessage;
  onDismiss: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const actionRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const messageId = useId();
  const handled = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    actionRef.current?.focus();
    return () => { if (dialog.open) dialog.close(); };
  }, []);

  function dismiss() {
    if (handled.current) return;
    handled.current = true;
    dialogRef.current?.close();
    onDismiss();
    if (feedback.focusId) {
      const id = feedback.focusId;
      requestAnimationFrame(() => {
        const field = document.getElementById(id);
        if (field instanceof HTMLElement) {
          field.focus({ preventScroll: true });
          field.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      });
    }
  }

  return createPortal(
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      data-tone={feedback.tone}
      role={feedback.tone === "error" ? "alertdialog" : "dialog"}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={messageId}
      onCancel={(event) => { event.preventDefault(); dismiss(); }}
    >
      <div className={styles.content}>
        <div className={styles.symbol} aria-hidden="true">{toneIcons[feedback.tone]}</div>
        <span className={styles.eyebrow}>{toneLabels[feedback.tone]}</span>
        <h2 id={titleId}>{feedback.title}</h2>
        <p id={messageId}>{feedback.message}</p>
      </div>
      <div className={styles.actions}>
        <button ref={actionRef} type="button" onClick={dismiss}>
          {feedback.actionLabel ?? (feedback.focusId ? "Corrigir campo" : "Entendi")}
        </button>
      </div>
    </dialog>,
    document.body,
  );
}

/** Um único padrão de feedback disponível em todas as rotas do site e do painel. */
export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [feedback, setFeedback] = useState<FeedbackMessage | null>(null);
  const showFeedback = useCallback((message: FeedbackMessage) => {
    setFeedback({ ...message });
  }, []);
  const onDismiss = useCallback(() => setFeedback(null), []);
  return (
    <FeedbackContext.Provider value={{ showFeedback }}>
      {children}
      {feedback ? <FeedbackDialog feedback={feedback} onDismiss={onDismiss} /> : null}
    </FeedbackContext.Provider>
  );
}
